/**
 * OUR HOME — the catalog.
 *
 * The ledger of every object the home understands: its hand-drawn isometric
 * art, its tile footprint, where it may rest, and the seats it offers to
 * smaller things. The room starts empty — couples furnish it themselves from
 * the drawer, minting as many instances of anything as a life needs. Nothing
 * costs anything; parcel-only pieces still arrive wrapped from lived life.
 *
 * Sizing: `tw`×`td` = floor footprint in tiles (wall/surface pieces use tw as
 * wall width and td = 0); `w`×`h` = screen bounding box for hit areas, rim
 * highlights, plaque anchors and drawer thumbnails.
 */
import { HomeCategory, HomeSku } from './homeTypes';
import {
  ArmchairArt, SpindleChairArt, FloorCushionArt, BraidedRugArt, WaffleThrowArt,
} from './objects/homeObjectsSoft';
import {
  SideTableArt, LowTableArt, FloatingShelfArt, BookcaseArt,
} from './objects/homeObjectsSurfaces';
import { LampYoursArt, LampTheirsArt, CandleArt } from './objects/homeObjectsLight';
import {
  MugWineArt, MugGoldArt, CoffeePotArt, CookiePlateArt, NotepadArt, VaseArt,
  BookArt, SillPotArt, CocoBasketArt,
} from './objects/homeObjectsSmall';
import {
  BrassFrameArt, WalnutFrameArt, PostcardArt, TwoTimesClockArt,
} from './objects/homeObjectsWall';
import {
  ShoeboxArt, ShellBowlArt, PressedFlowerArt, TicketStubArt,
} from './objects/homeObjectsKept';
import {
  SofaThreeArt, LoveseatArt, RockingChairArt, ChaiseArt, OttomanArt, PoufArt,
  BedArt, BenchArt,
} from './objects/homeObjectsSeatingPlus';
import {
  DiningTableArt, DiningChairArt, DeskArt, DeskChairArt, NightstandArt,
  DresserArt, WardrobeArt, BookshelfTallArt, LadderShelfArt, BarCartArt,
  TvConsoleArt,
} from './objects/homeObjectsStoragePlus';
import {
  ArcLampArt, TripodLampArt, TableLampArt, LanternArt, StringLightsArt,
  MonsteraArt, FiddleLeafArt, PalmArt, HangingPlantArt, AquariumArt,
} from './objects/homeObjectsGreenGlow';
import {
  RecordPlayerArt, UprightPianoArt, GuitarStandArt, VinylCrateArt,
  BookStackArt, GlobeArt, TelescopeArt, PersianRugArt, RoundRugArt,
  TapestryArt, LandscapeFrameArt, AbstractFrameArt,
} from './objects/homeObjectsDecorPlus';
import { WindowArt, FrontDoorArt, HearthArt } from './objects/homeObjectsStructure';

const SKUS: HomeSku[] = [
  /* ═══ structure — even the bones are yours to place ═══ */
  {
    sku: 'window', name: 'the window', category: 'structure',
    w: 76, h: 118, tw: 3, td: 0, facings: 2, placeOn: ['wall'],
    provenanceLabel: 'left wall shows your sky, right shows theirs',
    art: WindowArt,
  },
  {
    sku: 'front-door', name: 'the front door', category: 'structure',
    w: 62, h: 140, tw: 2.2, td: 0, facings: 2, placeOn: ['wall'],
    provenanceLabel: 'every home starts with a door',
    art: FrontDoorArt,
  },
  {
    sku: 'hearth', name: 'the hearth', category: 'structure',
    w: 92, h: 130, tw: 2, td: 1, facings: 2, placeOn: ['floor'], emitsLight: true,
    seats: [
      { dx: -10, dy: -73, maxW: 24 },
      { dx: 10, dy: -63, maxW: 24 },
    ],
    provenanceLabel: 'it burns a little brighter for every question you both answer',
    art: HearthArt,
  },

  /* ═══ seating & soft ═══ */
  {
    sku: 'sofa-three', name: 'the deep sofa', category: 'seating',
    w: 132, h: 72, tw: 3, td: 1, facings: 2, placeOn: ['floor'],
    seats: [{ dx: -20, dy: -40, maxW: 26 }, { dx: 20, dy: -20, maxW: 26 }],
    provenanceLabel: 'built for movie nights that run long',
    art: SofaThreeArt,
  },
  {
    sku: 'loveseat', name: 'the loveseat', category: 'seating',
    w: 92, h: 68, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    seats: [{ dx: 0, dy: -30, maxW: 26 }],
    provenanceLabel: 'two seats, no space between',
    art: LoveseatArt,
  },
  {
    sku: 'armchair', name: 'the armchair', category: 'seating',
    w: 84, h: 92, tw: 2, td: 2, facings: 2, placeOn: ['floor'],
    seats: [{ dx: 14, dy: -34, maxW: 26 }],
    provenanceLabel: 'the first place to sit down together',
    art: ArmchairArt,
  },
  {
    sku: 'rocking-chair', name: 'the rocking chair', category: 'seating',
    w: 52, h: 70, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'for slow mornings and long thoughts',
    art: RockingChairArt,
  },
  {
    sku: 'chaise', name: 'the chaise', category: 'seating',
    w: 92, h: 62, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'reading, allegedly',
    art: ChaiseArt,
  },
  {
    sku: 'spindle-chair', name: 'the spindle chair', category: 'seating',
    w: 46, h: 62, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    seats: [{ dx: 0, dy: -20, maxW: 26 }],
    provenanceLabel: 'for whoever gets up to make the coffee',
    art: SpindleChairArt,
  },
  {
    sku: 'bed', name: 'the bed', category: 'seating',
    w: 132, h: 82, tw: 3, td: 2, facings: 2, placeOn: ['floor'],
    seats: [{ dx: 24, dy: -32, maxW: 30 }],
    provenanceLabel: 'where every day ends up',
    art: BedArt,
  },
  {
    sku: 'bench', name: 'the entry bench', category: 'seating',
    w: 88, h: 42, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    seats: [{ dx: -10, dy: -25, maxW: 24 }],
    provenanceLabel: 'sit down, take your shoes off, stay',
    art: BenchArt,
  },
  {
    sku: 'ottoman', name: 'the ottoman', category: 'seating',
    w: 44, h: 36, tw: 1, td: 1, facings: 1, placeOn: ['floor'],
    seats: [{ dx: 0, dy: -18, maxW: 24 }],
    provenanceLabel: 'feet up, world off',
    art: OttomanArt,
  },
  {
    sku: 'pouf', name: 'the knit pouf', category: 'seating',
    w: 42, h: 32, tw: 1, td: 1, facings: 1, placeOn: ['floor'],
    provenanceLabel: 'the extra seat that is always taken',
    art: PoufArt,
  },
  {
    sku: 'floor-cushion', name: 'the floor cushion', category: 'seating',
    w: 44, h: 30, tw: 1, td: 1, facings: 1, placeOn: ['floor'],
    provenanceLabel: 'for sitting closer to the fire',
    art: FloorCushionArt,
  },
  {
    sku: 'waffle-throw', name: 'the waffle throw', category: 'seating',
    w: 42, h: 30, tw: 1, td: 1, facings: 2, placeOn: ['floor', 'surface'],
    provenanceLabel: 'warm enough for two, barely',
    art: WaffleThrowArt,
  },

  /* ═══ rugs ═══ */
  {
    sku: 'persian-rug', name: 'the heirloom rug', category: 'rugs',
    w: 108, h: 58, tw: 3, td: 2, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'it makes the whole room agree',
    art: PersianRugArt,
  },
  {
    sku: 'round-rug', name: 'the round rug', category: 'rugs',
    w: 88, h: 48, tw: 2, td: 2, facings: 1, placeOn: ['floor'],
    provenanceLabel: 'soft landing, dead centre',
    art: RoundRugArt,
  },
  {
    sku: 'braided-rug', name: 'the braided rug', category: 'rugs',
    w: 104, h: 56, tw: 3, td: 2, facings: 2, placeOn: ['floor'],
    parcelOnly: true,
    provenanceLabel: 'the first thing we ever owned together',
    art: BraidedRugArt,
  },

  /* ═══ tables & storage ═══ */
  {
    sku: 'dining-table', name: 'the dining table', category: 'surface',
    w: 100, h: 62, tw: 2, td: 2, facings: 1, placeOn: ['floor'],
    seats: [{ dx: -10, dy: -35, maxW: 30 }, { dx: 10, dy: -25, maxW: 30 }],
    provenanceLabel: 'for dinners that become conversations',
    art: DiningTableArt,
  },
  {
    sku: 'dining-chair', name: 'the dining chair', category: 'surface',
    w: 46, h: 60, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'place four — hope for company',
    art: DiningChairArt,
  },
  {
    sku: 'low-table', name: 'the low table', category: 'surface',
    w: 66, h: 44, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    seats: [
      { dx: -10, dy: -27, maxW: 30 },
      { dx: 10, dy: -17, maxW: 30 },
    ],
    provenanceLabel: 'coffee-table books optional',
    art: LowTableArt,
  },
  {
    sku: 'side-table', name: 'the side table', category: 'surface',
    w: 44, h: 52, tw: 1, td: 1, facings: 1, placeOn: ['floor'],
    seats: [{ dx: 0, dy: -30, maxW: 30 }],
    provenanceLabel: 'where the evening things live',
    art: SideTableArt,
  },
  {
    sku: 'desk', name: 'the writing desk', category: 'surface',
    w: 92, h: 56, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    seats: [{ dx: -10, dy: -37, maxW: 26 }],
    provenanceLabel: 'letters get written here, eventually',
    art: DeskArt,
  },
  {
    sku: 'desk-chair', name: 'the desk chair', category: 'surface',
    w: 46, h: 56, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'spins, if you need it to',
    art: DeskChairArt,
  },
  {
    sku: 'nightstand', name: 'the nightstand', category: 'surface',
    w: 44, h: 46, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    seats: [{ dx: 0, dy: -26, maxW: 26 }],
    provenanceLabel: 'water glass, phone, one good book',
    art: NightstandArt,
  },
  {
    sku: 'dresser', name: 'the dresser', category: 'surface',
    w: 90, h: 56, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    seats: [{ dx: -10, dy: -39, maxW: 26 }, { dx: 10, dy: -29, maxW: 26 }],
    provenanceLabel: 'the top drawer is yours',
    art: DresserArt,
  },
  {
    sku: 'wardrobe', name: 'the wardrobe', category: 'surface',
    w: 90, h: 100, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'half yours, half theirs, all full',
    art: WardrobeArt,
  },
  {
    sku: 'bookshelf-tall', name: 'the tall bookshelf', category: 'surface',
    w: 90, h: 106, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'every memory earns a spine here',
    art: BookshelfTallArt,
  },
  {
    sku: 'bookcase', name: 'the small bookcase', category: 'surface',
    w: 66, h: 82, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    seats: [
      { dx: -10, dy: -69, maxW: 24 },
      { dx: 10, dy: -59, maxW: 24 },
    ],
    provenanceLabel: 'the shelf that fills itself',
    art: BookcaseArt,
  },
  {
    sku: 'ladder-shelf', name: 'the ladder shelf', category: 'surface',
    w: 48, h: 90, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    seats: [{ dx: 0, dy: -70, maxW: 20 }],
    provenanceLabel: 'leans, but never lets go',
    art: LadderShelfArt,
  },
  {
    sku: 'bar-cart', name: 'the bar cart', category: 'surface',
    w: 48, h: 54, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    seats: [{ dx: 0, dy: -34, maxW: 22 }],
    provenanceLabel: 'for anniversaries and Tuesdays',
    art: BarCartArt,
  },
  {
    sku: 'tv-console', name: 'the television', category: 'surface',
    w: 92, h: 80, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'one more episode, then bed',
    art: TvConsoleArt,
  },
  {
    sku: 'floating-shelf', name: 'the floating shelf', category: 'surface',
    w: 74, h: 26, tw: 2, td: 0, facings: 2, placeOn: ['wall'],
    provenanceLabel: 'a shelf for the things that matter',
    art: FloatingShelfArt,
  },

  /* ═══ lighting ═══ */
  {
    sku: 'lamp-a', name: 'the wine lamp', category: 'light',
    w: 40, h: 88, tw: 1, td: 1, facings: 1, placeOn: ['floor'], emitsLight: true,
    provenanceLabel: 'the reason to come home',
    art: LampYoursArt,
  },
  {
    sku: 'lamp-b', name: 'the gold lamp', category: 'light',
    w: 40, h: 88, tw: 1, td: 1, facings: 1, placeOn: ['floor'], emitsLight: true,
    provenanceLabel: 'the reason to come home',
    art: LampTheirsArt,
  },
  {
    sku: 'arc-lamp', name: 'the arc lamp', category: 'light',
    w: 72, h: 100, tw: 1, td: 1, facings: 2, placeOn: ['floor'], emitsLight: true,
    provenanceLabel: 'it leans over the sofa like a question',
    art: ArcLampArt,
  },
  {
    sku: 'tripod-lamp', name: 'the tripod lamp', category: 'light',
    w: 52, h: 88, tw: 1, td: 1, facings: 2, placeOn: ['floor'], emitsLight: true,
    provenanceLabel: 'three legs, one warm circle',
    art: TripodLampArt,
  },
  {
    sku: 'table-lamp', name: 'the table lamp', category: 'light',
    w: 22, h: 26, tw: 0.45, td: 0, facings: 1, placeOn: ['surface'], emitsLight: true,
    provenanceLabel: 'small light, late talks',
    art: TableLampArt,
  },
  {
    sku: 'lantern', name: 'the lantern', category: 'light',
    w: 18, h: 22, tw: 0.4, td: 0, facings: 1, placeOn: ['surface'], emitsLight: true,
    provenanceLabel: 'for power cuts and picnics indoors',
    art: LanternArt,
  },
  {
    sku: 'string-lights', name: 'the string lights', category: 'light',
    w: 124, h: 34, tw: 3, td: 0, facings: 2, placeOn: ['wall'], emitsLight: true,
    provenanceLabel: 'every night is a small occasion',
    art: StringLightsArt,
  },
  {
    sku: 'candle', name: 'the chamberstick', category: 'light',
    w: 20, h: 26, tw: 0.4, td: 0, facings: 1, placeOn: ['surface'], emitsLight: true,
    provenanceLabel: 'lit when one of us is thinking of the other',
    art: CandleArt,
  },

  /* ═══ plants & living ═══ */
  {
    sku: 'monstera', name: 'the monstera', category: 'living',
    w: 56, h: 70, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'it grew a new leaf — celebrate accordingly',
    art: MonsteraArt,
  },
  {
    sku: 'fiddle-leaf', name: 'the fiddle-leaf fig', category: 'living',
    w: 48, h: 80, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'dramatic, but worth it',
    art: FiddleLeafArt,
  },
  {
    sku: 'parlor-palm', name: 'the parlour palm', category: 'living',
    w: 60, h: 72, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'a small indoor holiday',
    art: PalmArt,
  },
  {
    sku: 'hanging-plant', name: 'the hanging pothos', category: 'living',
    w: 36, h: 50, tw: 0.6, td: 0, facings: 2, placeOn: ['wall'],
    provenanceLabel: 'it reaches for the window, like everyone',
    art: HangingPlantArt,
  },
  {
    sku: 'aquarium', name: 'the aquarium', category: 'living',
    w: 92, h: 78, tw: 2, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'two fish, named after us',
    art: AquariumArt,
  },
  {
    sku: 'sill-pot', name: 'the sill pot', category: 'living',
    w: 20, h: 30, tw: 0.4, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'it grows when we both show up',
    art: SillPotArt,
  },
  {
    sku: 'coco-basket', name: "Coco's basket", category: 'living',
    w: 44, h: 26, tw: 1, td: 1, facings: 1, placeOn: ['floor'],
    provenanceLabel: 'hers before it was ours',
    art: CocoBasketArt,
  },

  /* ═══ music & wonder ═══ */
  {
    sku: 'record-player', name: 'the record player', category: 'music',
    w: 48, h: 50, tw: 1, td: 1, facings: 2, placeOn: ['floor', 'surface'],
    provenanceLabel: 'side B is for slow dancing',
    art: RecordPlayerArt,
  },
  {
    sku: 'upright-piano', name: 'the upright piano', category: 'music',
    w: 130, h: 90, tw: 3, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'played badly, loved loudly',
    art: UprightPianoArt,
  },
  {
    sku: 'guitar-stand', name: 'the guitar', category: 'music',
    w: 40, h: 62, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'three chords and the truth',
    art: GuitarStandArt,
  },
  {
    sku: 'vinyl-crate', name: 'the vinyl crate', category: 'music',
    w: 42, h: 34, tw: 1, td: 1, facings: 2, placeOn: ['floor', 'surface'],
    provenanceLabel: 'alphabetised by feeling',
    art: VinylCrateArt,
  },
  {
    sku: 'telescope', name: 'the telescope', category: 'music',
    w: 52, h: 78, tw: 1, td: 1, facings: 2, placeOn: ['floor'],
    provenanceLabel: 'pointed at the same moon as theirs',
    art: TelescopeArt,
  },
  {
    sku: 'globe', name: 'the desk globe', category: 'music',
    w: 20, h: 22, tw: 0.4, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'spin it — that is where we will go',
    art: GlobeArt,
  },

  /* ═══ walls ═══ */
  {
    sku: 'landscape-frame', name: 'the little landscape', category: 'wall',
    w: 50, h: 40, tw: 1.2, td: 0, facings: 2, placeOn: ['wall'],
    provenanceLabel: 'somewhere we have not been yet',
    art: LandscapeFrameArt,
  },
  {
    sku: 'abstract-frame', name: 'the abstract', category: 'wall',
    w: 36, h: 46, tw: 0.85, td: 0, facings: 2, placeOn: ['wall'],
    provenanceLabel: 'we see different things in it — good',
    art: AbstractFrameArt,
  },
  {
    sku: 'tapestry', name: 'the tapestry', category: 'wall',
    w: 66, h: 84, tw: 1.6, td: 0, facings: 2, placeOn: ['wall'],
    provenanceLabel: 'woven sun for sunless days',
    art: TapestryArt,
  },
  {
    sku: 'brass-frame', name: 'the brass frame', category: 'wall',
    w: 34, h: 42, tw: 0.8, td: 0, facings: 2, placeOn: ['wall'],
    provenanceLabel: 'waiting for the right photograph',
    art: BrassFrameArt,
  },
  {
    sku: 'walnut-frame', name: 'the walnut frame', category: 'wall',
    w: 44, h: 36, tw: 1.1, td: 0, facings: 2, placeOn: ['wall'],
    provenanceLabel: 'waiting for the right photograph',
    art: WalnutFrameArt,
  },
  {
    sku: 'postcard', name: 'the postcard', category: 'wall',
    w: 18, h: 24, tw: 0.45, td: 0, facings: 2, placeOn: ['wall', 'surface'],
    provenanceLabel: 'wish you were here',
    art: PostcardArt,
  },
  {
    sku: 'two-times-clock', name: 'the two-times clock', category: 'wall',
    w: 28, h: 32, tw: 0.7, td: 0, facings: 2, placeOn: ['wall'],
    parcelOnly: true,
    provenanceLabel: 'so our hours can share a wall',
    art: TwoTimesClockArt,
  },

  /* ═══ little things ═══ */
  {
    sku: 'mug-wine', name: 'the wine-rim mug', category: 'table-things',
    w: 14, h: 14, tw: 0.3, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'never quite finished in time',
    art: MugWineArt,
  },
  {
    sku: 'mug-gold', name: 'the gold-rim mug', category: 'table-things',
    w: 14, h: 14, tw: 0.3, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'never quite finished in time',
    art: MugGoldArt,
  },
  {
    sku: 'coffee-pot', name: 'the coffee pot', category: 'table-things',
    w: 20, h: 22, tw: 0.4, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'the morning bell of this house',
    art: CoffeePotArt,
  },
  {
    sku: 'cookie-plate', name: 'the cookie plate', category: 'table-things',
    w: 26, h: 12, tw: 0.6, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'left out means help yourself',
    art: CookiePlateArt,
  },
  {
    sku: 'notepad', name: 'the notepad', category: 'table-things',
    w: 22, h: 14, tw: 0.5, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'for the words that can wait',
    art: NotepadArt,
  },
  {
    sku: 'vase', name: 'the milk-glass vase', category: 'table-things',
    w: 16, h: 22, tw: 0.35, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'flowers dry here; they never die',
    art: VaseArt,
  },
  {
    sku: 'book', name: 'the book', category: 'table-things',
    w: 22, h: 12, tw: 0.5, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'one question a day lives in here',
    art: BookArt,
  },
  {
    sku: 'book-stack', name: 'the book stack', category: 'table-things',
    w: 20, h: 14, tw: 0.4, td: 0, facings: 1, placeOn: ['surface'],
    provenanceLabel: 'currently reading: all of them',
    art: BookStackArt,
  },

  /* ═══ kept things ═══ */
  {
    sku: 'shoebox', name: 'the shoebox', category: 'kept',
    w: 38, h: 24, tw: 1, td: 1, facings: 2, placeOn: ['floor', 'surface'],
    provenanceLabel: 'every note either of us ever kept',
    art: ShoeboxArt,
  },
  {
    sku: 'shell-bowl', name: 'the shell bowl', category: 'kept',
    w: 22, h: 12, tw: 0.5, td: 0, facings: 1, placeOn: ['surface'],
    parcelOnly: true,
    provenanceLabel: 'from somewhere we stood together',
    art: ShellBowlArt,
  },
  {
    sku: 'pressed-flower', name: 'the pressed flower', category: 'kept',
    w: 22, h: 28, tw: 0.55, td: 0, facings: 2, placeOn: ['wall'],
    parcelOnly: true,
    provenanceLabel: 'it survived because we both remembered',
    art: PressedFlowerArt,
  },
  {
    sku: 'ticket-stub', name: 'the ticket stub', category: 'kept',
    w: 18, h: 10, tw: 0.4, td: 0, facings: 1, placeOn: ['surface'],
    parcelOnly: true,
    provenanceLabel: 'admit two',
    art: TicketStubArt,
  },
];

const BY_SKU = new Map<string, HomeSku>(SKUS.map((s) => [s.sku, s]));

export const skuOf = (sku: string): HomeSku | undefined => BY_SKU.get(sku);

export const allSkus = (): readonly HomeSku[] => SKUS;

/** Drawer order + warm labels for the category chips. */
export const CATEGORY_ORDER: ReadonlyArray<{ key: HomeCategory; label: string }> = [
  { key: 'structure', label: 'Structure' },
  { key: 'seating', label: 'Seating' },
  { key: 'rugs', label: 'Rugs' },
  { key: 'surface', label: 'Tables & storage' },
  { key: 'light', label: 'Lighting' },
  { key: 'living', label: 'Plants & living' },
  { key: 'music', label: 'Music & wonder' },
  { key: 'wall', label: 'Walls' },
  { key: 'table-things', label: 'Little things' },
  { key: 'kept', label: 'Kept' },
];

/** What the drawer offers: everything that doesn't arrive wrapped. */
export const drawerSkus = (): readonly HomeSku[] => SKUS.filter((s) => !s.parcelOnly);
