from __future__ import annotations

import argparse
import json
import os
import site
import sys
import time
from collections import Counter
from pathlib import Path


def _ensure_user_site() -> None:
    user_site = site.getusersitepackages()
    if isinstance(user_site, str):
        user_sites = [user_site]
    else:
        user_sites = list(user_site)
    for path in user_sites:
        if path and path not in sys.path:
            sys.path.append(path)


_ensure_user_site()

try:
    from graphify.analyze import god_nodes, surprising_connections, suggest_questions
    from graphify.build import build_from_json
    from graphify.cluster import cluster, score_all
    from graphify.detect import CODE_EXTENSIONS
    from graphify.export import to_canvas, to_html, to_json, to_obsidian, to_svg
    from graphify.extract import extract
    from graphify.report import generate
    from graphify.wiki import to_wiki
except ModuleNotFoundError as exc:  # pragma: no cover - startup guard
    raise SystemExit(
        "Graphify Python package is not available. Install it with "
        "`python -m pip install --user graphifyy`."
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "graphify.second-brain.json"
OUT_DIR = ROOT / "graphify-out"
OBSIDIAN_DIR = OUT_DIR / "obsidian"
WIKI_DIR = OUT_DIR / "wiki"
REPORT_PATH = OUT_DIR / "GRAPH_REPORT.md"
GRAPH_PATH = OUT_DIR / "graph.json"
HTML_PATH = OUT_DIR / "graph.html"
SVG_PATH = OUT_DIR / "graph.svg"
CANVAS_PATH = OBSIDIAN_DIR / "graph.canvas"
MANIFEST_PATH = OUT_DIR / "second-brain-manifest.json"

DEFAULT_CONFIG = {
    "roots": [
        "App.tsx",
        "index.tsx",
        "types.ts",
        "capacitor.config.ts",
        "vite.config.ts",
        "components",
        "hooks",
        "services",
        "utils",
        "views",
        "workers",
        "supabase/functions",
        "android/app/src/main/java",
    ]
}


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return DEFAULT_CONFIG
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def _is_hidden(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts)


def collect_code_files(config: dict) -> list[Path]:
    files: list[Path] = []
    seen: set[Path] = set()
    for entry in config.get("roots", []):
        target = ROOT / entry
        if not target.exists():
            continue
        if target.is_file():
            if target.suffix.lower() in CODE_EXTENSIONS and target not in seen:
                files.append(target)
                seen.add(target)
            continue
        for path in target.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in CODE_EXTENSIONS:
                continue
            if _is_hidden(path.relative_to(ROOT)):
                continue
            if path not in seen:
                files.append(path)
                seen.add(path)
    files.sort()
    return files


def estimate_words(paths: list[Path]) -> int:
    total = 0
    for path in paths:
        try:
            total += len(path.read_text(encoding="utf-8", errors="ignore").split())
        except OSError:
            continue
    return total


def _top_scope(source_file: str) -> str:
    normalized = source_file.replace("\\", "/")
    root_prefix = ROOT.as_posix().rstrip("/") + "/"
    if normalized.startswith(root_prefix):
        normalized = normalized[len(root_prefix) :]
    normalized = normalized.lstrip("/")
    if not normalized:
        return "root"
    parts = [part for part in normalized.split("/") if part]
    if len(parts) >= 2:
        return parts[0]
    if "." in parts[0]:
        return "root"
    return parts[0]


def derive_community_labels(G, communities: dict[int, list[str]]) -> dict[int, str]:
    labels: dict[int, str] = {}
    for cid, members in communities.items():
        scope_counts: Counter[str] = Counter()
        for node_id in members:
            source_file = G.nodes[node_id].get("source_file", "")
            if source_file:
                scope_counts[_top_scope(source_file)] += 1
        scopes = [scope for scope, _ in scope_counts.most_common(2)]
        if scopes:
            labels[cid] = " + ".join(scopes)
        else:
            labels[cid] = f"Community {cid}"
    return labels


def build_second_brain() -> dict:
    config = load_config()
    code_files = collect_code_files(config)
    if not code_files:
        raise SystemExit("No code files found for the configured second-brain roots.")

    OUT_DIR.mkdir(exist_ok=True)
    OBSIDIAN_DIR.mkdir(parents=True, exist_ok=True)
    WIKI_DIR.mkdir(parents=True, exist_ok=True)

    extraction = extract(code_files)
    graph = build_from_json(extraction)
    communities = cluster(graph)
    cohesion = score_all(graph, communities)
    labels = derive_community_labels(graph, communities)
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    questions = suggest_questions(graph, communities, labels)

    detection = {
        "files": {"code": [str(path.relative_to(ROOT)).replace(os.sep, "/") for path in code_files]},
        "total_files": len(code_files),
        "total_words": estimate_words(code_files),
        "warning": None,
    }

    report = generate(
        graph,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection,
        {"input": 0, "output": 0},
        str(ROOT),
        suggested_questions=questions,
    )
    REPORT_PATH.write_text(report, encoding="utf-8")

    to_json(graph, communities, str(GRAPH_PATH))
    to_html(graph, communities, str(HTML_PATH), community_labels=labels)
    svg_written = True
    try:
        to_svg(graph, communities, str(SVG_PATH), community_labels=labels)
    except ImportError:
        svg_written = False
    to_obsidian(graph, communities, str(OBSIDIAN_DIR), community_labels=labels, cohesion=cohesion)
    to_canvas(graph, communities, str(CANVAS_PATH), community_labels=labels)
    to_wiki(graph, communities, WIKI_DIR, community_labels=labels, cohesion=cohesion, god_nodes_data=gods)

    manifest = {
        "roots": config.get("roots", []),
        "files_indexed": len(code_files),
        "nodes": graph.number_of_nodes(),
        "edges": graph.number_of_edges(),
        "communities": len(communities),
        "svg_written": svg_written,
        "generated_at_epoch": int(time.time()),
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def snapshot_files(config: dict) -> dict[str, tuple[int, int]]:
    snapshot: dict[str, tuple[int, int]] = {}
    for path in collect_code_files(config):
        stat = path.stat()
        rel = str(path.relative_to(ROOT)).replace(os.sep, "/")
        snapshot[rel] = (stat.st_mtime_ns, stat.st_size)
    return snapshot


def watch(interval: float) -> None:
    config = load_config()
    build_second_brain()
    previous = snapshot_files(config)
    print(f"[graphify second brain] Watching {ROOT} every {interval:.1f}s")
    try:
        while True:
            time.sleep(interval)
            current = snapshot_files(config)
            if current != previous:
                print("[graphify second brain] Changes detected. Refreshing graph outputs.")
                manifest = build_second_brain()
                print(
                    "[graphify second brain] Refresh complete: "
                    f"{manifest['nodes']} nodes, {manifest['edges']} edges, "
                    f"{manifest['communities']} communities"
                )
                previous = current
    except KeyboardInterrupt:
        print("[graphify second brain] Watch stopped.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build an Obsidian-friendly Graphify second brain.")
    parser.add_argument("--watch", action="store_true", help="Continuously rebuild when scoped code files change.")
    parser.add_argument(
        "--interval",
        type=float,
        default=5.0,
        help="Polling interval in seconds for watch mode.",
    )
    args = parser.parse_args()

    if args.watch:
        watch(args.interval)
        return

    manifest = build_second_brain()
    print(
        "Graphify second brain ready: "
        f"{manifest['files_indexed']} files, {manifest['nodes']} nodes, "
        f"{manifest['edges']} edges, {manifest['communities']} communities."
    )
    print(f"Open {OBSIDIAN_DIR} in Obsidian, or jump in from {ROOT / 'Graphify Second Brain.md'}.")


if __name__ == "__main__":
    main()
