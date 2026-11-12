import type { RefObject } from 'react';

export const HelpDialog = ({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) => (
  <dialog ref={dialogRef} id="radio-dialog" className="radio-dialog">
    <form method="dialog">
      <header className="titlebar">
        <span>Auralithic 95 FM</span>
        <button className="window-button close" value="close" aria-label="Close help" />
      </header>
      <div className="radio-dialog-body">
        <img src="/icons/radio.svg" width={38} height={38} alt="" />
        <div>
          <strong>Auralithic 95 FM</strong>
          <p>Independent radio. A little frequency of our own.</p>
          <p>Press Play to tune into the collective. Open Artists to explore a catalog or tune into one artist’s station.</p>
          <small>Built for the music. Dressed for 1995.</small>
        </div>
      </div>
      <footer>
        <button className="primary" value="close">OK</button>
      </footer>
    </form>
  </dialog>
);
