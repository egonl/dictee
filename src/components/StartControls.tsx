const PRESET_QUESTION_COUNTS = [5, 10, 15, 20, 30];

type StartControlsProps = {
  listNames: string[];
  activeWordListKey: string;
  questionsPerRound: number;
  customQuestionCount: string;
  continueUntilCorrect: boolean;
  onListChange: (value: string) => void;
  onPresetSelect: (count: number) => void;
  onCustomChange: (value: string) => void;
  onCustomApply: () => void;
  onContinueUntilCorrectChange: (value: boolean) => void;
  onStart: () => void;
  onNewList: () => void;
  onEditList: () => void;
  onDeleteList: () => void;
  canDeleteList: boolean;
};

export default function StartControls({
  listNames,
  activeWordListKey,
  questionsPerRound,
  customQuestionCount,
  continueUntilCorrect,
  onListChange,
  onPresetSelect,
  onCustomChange,
  onCustomApply,
  onContinueUntilCorrectChange,
  onStart,
  onNewList,
  onEditList,
  onDeleteList,
  canDeleteList,
}: StartControlsProps) {
  return (
    <div className="center-block">
      <div className="list-picker">
        <label htmlFor="word-list-select">Kies woordenlijst</label>
        <div className="list-picker-row">
          <select
            id="word-list-select"
            value={activeWordListKey}
            onChange={(event) => onListChange(event.target.value)}
          >
            {listNames.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <button className="btn secondary" type="button" onClick={onNewList}>
            Nieuw...
          </button>
          <button className="btn secondary" type="button" onClick={onEditList}>
            Bewerken
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={onDeleteList}
            disabled={!canDeleteList}
          >
            Verwijderen
          </button>
        </div>
      </div>
      <div className="question-picker">
        {PRESET_QUESTION_COUNTS.map((count) => (
          <button
            key={count}
            className={`btn choice ${
              questionsPerRound === count ? "active" : ""
            }`}
            onClick={() => onPresetSelect(count)}
            type="button"
            disabled={continueUntilCorrect}
          >
            {count}
          </button>
        ))}
      </div>
      <div className="custom-question-picker">
        <label htmlFor="custom-count">Eigen aantal vragen</label>
        <input
          id="custom-count"
          type="number"
          min={1}
          max={100}
          value={customQuestionCount}
          onChange={(event) => onCustomChange(event.target.value)}
          placeholder="Bijv. 12"
          disabled={continueUntilCorrect}
        />
        <button
          className="btn secondary"
          onClick={onCustomApply}
          type="button"
          disabled={continueUntilCorrect}
        >
          Gebruik aantal
        </button>
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={continueUntilCorrect}
          onChange={(event) =>
            onContinueUntilCorrectChange(event.target.checked)
          }
        />
        Ga door tot alles goed is
      </label>
      <p className="help">Nu ingesteld: {questionsPerRound} vragen per ronde.</p>
      <button className="btn primary" onClick={onStart}>
        Start dictee
      </button>
    </div>
  );
}
