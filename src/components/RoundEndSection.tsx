import type { MistakeEntry } from "../types";
import MistakesPanel from "./MistakesPanel";

type RoundEndSectionProps = {
  roundCorrect: number;
  questionsPerRound: number;
  roundMistakes: MistakeEntry[];
  showMistakes: boolean;
  onToggleMistakes: () => void;
  speechSupported: boolean;
  onNextRound: () => void;
  celebrationGifSrc: string;
};

export default function RoundEndSection({
  roundCorrect,
  questionsPerRound,
  roundMistakes,
  showMistakes,
  onToggleMistakes,
  speechSupported,
  onNextRound,
  celebrationGifSrc,
}: RoundEndSectionProps) {
  return (
    <section className="round-end">
      <img
        className="celebration-gif"
        src={celebrationGifSrc}
        alt="Enthousiaste thumbs up"
      />
      <p className="mascot-text">Goed gedaan!</p>
      <h2>Ronde klaar!</h2>
      <p>
        Je had {roundCorrect} van de {questionsPerRound} goed.
      </p>
      {roundMistakes.length > 0 && (
        <>
          <button
            className="btn secondary"
            type="button"
            onClick={onToggleMistakes}
          >
            {showMistakes ? "Verberg fouten" : "Bekijk fouten"}
          </button>
          {showMistakes && <MistakesPanel entries={roundMistakes} />}
        </>
      )}
      <div className="round-end-actions">
        {!speechSupported && (
          <p className="warn">Deze browser ondersteunt geen voorleesfunctie.</p>
        )}
      </div>
      <button className="btn primary" onClick={onNextRound}>
        Nieuwe ronde
      </button>
    </section>
  );
}
