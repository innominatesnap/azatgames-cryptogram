import type { Word } from '../engine/cipher';
import type { SolveState } from '../engine/solve';
import { tileCues } from '../hints/feedback';
import { keyboardFaces, sameSpot, type TileSpot } from '../play/input';

export type PlayMode = 'practice' | 'live';

export function playSurface(mode: PlayMode) {
  void mode;
  return {
    Board: PuzzleBoard,
    input: 'onscreen-keyboard' as const,
    wordEditor: false as const,
  };
}

export function PuzzleBoard(props: {
  words: Word[];
  session: SolveState;
  spot: TileSpot | null;
  shaking: number[];
  highlight: number | null;
  onSelect: (spot: TileSpot) => void;
  onType: (letter: string) => void;
  onDelete: () => void;
}) {
  const selectedNumber = props.spot ? props.spot.number : null;
  const locked = selectedNumber !== null && Boolean(props.session.revealedLetters[selectedNumber]);
  const faces = keyboardFaces(props.session, selectedNumber);
  return (
    <div data-input="onscreen-keyboard" data-renderer="PuzzleBoard">
      <div className="board">
        {props.words.map((word, wordIndex) => (
          <div className="word" key={'w' + String(wordIndex)}>
            {word.tiles.map((tile, tileIndex) => {
              if (tile.kind === 'mark') {
                return <span className="tile-mark" key={'m' + String(tileIndex)}>{tile.char}</span>;
              }
              const guess = props.session.present[tile.number] || '';
              const spot = { wordIndex: wordIndex, tileIndex: tileIndex, number: tile.number };
              const current = sameSpot(props.spot, spot);
              const same = (selectedNumber !== null && tile.number === selectedNumber) || props.highlight === tile.number;
              const revealed = Boolean(props.session.revealedLetters[tile.number]);
              const marked = !revealed && props.session.markedNumbers.indexOf(tile.number) !== -1;
              const className = tileCues({ markedWrong: marked, revealed: revealed, sameNumber: same })
                + (current ? ' tile-current' : '')
                + (props.shaking.indexOf(tile.number) !== -1 ? ' tile-shake' : '');
              return (
                <button
                  type="button"
                  key={'t' + String(tileIndex)}
                  className={className}
                  aria-pressed={current}
                  aria-invalid={marked || undefined}
                  title={marked ? 'This letter is wrong. Change it to clear the mark.' : undefined}
                  aria-label={tileLabel(tile.number, guess, marked, revealed, current)}
                  onClick={() => props.onSelect(spot)}
                >
                  <span className="tile-glyph">
                    {marked ? <span className="tile-cue" aria-hidden="true">✕ </span> : null}
                    {revealed ? <span className="tile-cue" aria-hidden="true">lock </span> : null}
                    {guess || '\u00a0'}
                  </span>
                  <span className="tile-code">{tile.number}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {locked ? <p className="fine">Revealed letters stay locked.</p> : null}
      <div className="keyboard-dock">
        <div className="keyboard" role="group" aria-label="Letter keyboard">
          {faces.map((face) => {
            const className = 'key'
              + (face.used ? ' key-used' : '')
              + (face.current ? ' key-current' : '')
              + (face.crossed ? ' key-crossed' : '');
            return (
              <button
                type="button"
                key={face.letter}
                className={className}
                disabled={face.disabled}
                title={face.crossed ? 'Not in this puzzle.' : undefined}
                aria-label={
                  face.letter
                  + (face.crossed ? ', not in this puzzle' : '')
                  + (face.used ? ', in use, still available' : '')
                }
                onClick={() => props.onType(face.letter)}
              >
                {face.letter}
              </button>
            );
          })}
        </div>
        <button type="button" className="key key-delete" disabled={locked} onClick={props.onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function tileLabel(number: number, guess: string, marked: boolean, revealed: boolean, current: boolean): string {
  let label = 'Number ' + String(number) + (guess ? ', ' + guess : ', empty');
  if (current) label += ', selected';
  if (marked) label += ', marked wrong';
  if (revealed) label += ', revealed and locked';
  return label;
}
