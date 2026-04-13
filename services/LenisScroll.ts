class LenisScrollService {
  private _wrapper: HTMLElement | null = null;

  init(wrapper: HTMLElement): void {
    this._wrapper = wrapper;
  }

  destroy(): void {
    this._wrapper = null;
  }

  get scroll(): number {
    return this._wrapper?.scrollTop ?? 0;
  }

  get targetScroll(): number {
    return this._wrapper?.scrollTop ?? 0;
  }

  scrollTo(y: number, options: { immediate?: boolean } = {}): void {
    this._wrapper?.scrollTo({
      top: y,
      behavior: options.immediate ? 'auto' : 'smooth',
    });
  }

  get instance(): null {
    return null;
  }

  get isReady(): boolean {
    return this._wrapper !== null;
  }
}

export const LenisScroll = new LenisScrollService();
