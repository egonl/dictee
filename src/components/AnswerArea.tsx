import type { FormEvent, RefObject } from "react";

type AnswerAreaProps = {
  answer: string;
  onAnswerChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReplay: () => void;
  isSpeaking: boolean;
  speechSupported: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
};

export default function AnswerArea({
  answer,
  onAnswerChange,
  onSubmit,
  onReplay,
  isSpeaking,
  speechSupported,
  inputRef,
}: AnswerAreaProps) {
  return (
    <>
      <div className="speak-row">
        <button className="btn secondary" onClick={onReplay}>
          {isSpeaking ? "Aan het voorlezen..." : "Lees het woord opnieuw voor"}
        </button>
        {!speechSupported && (
          <p className="warn">Je browser ondersteunt geen voorleesfunctie.</p>
        )}
      </div>

      <form className="answer-form" onSubmit={onSubmit}>
        <label htmlFor="answer">Jouw antwoord:</label>
        <input
          ref={inputRef}
          id="answer"
          autoComplete="off"
          value={answer}
          onChange={(event) => onAnswerChange(event.target.value)}
          placeholder="..."
          required
        />
        <button className="btn primary" type="submit">
          Controleren
        </button>
      </form>
    </>
  );
}
