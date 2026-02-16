type StatsPanelProps = {
  round: number;
  questionNumber: number;
  questionsPerRound: number;
  totalCorrect: number;
  totalQuestions: number;
  accuracy: number;
  isUnlimited: boolean;
};

export default function StatsPanel({
  round,
  questionNumber,
  questionsPerRound,
  totalCorrect,
  totalQuestions,
  accuracy,
  isUnlimited,
}: StatsPanelProps) {
  const displayQuestion =
    questionNumber === 0
      ? 0
      : isUnlimited
        ? questionNumber
        : Math.min(questionNumber, questionsPerRound);

  return (
    <div className="stats">
      <div>
        <span className="label">Ronde</span>
        <strong>{round}</strong>
      </div>
      <div>
        <span className="label">Vraag</span>
        <strong>
          {isUnlimited
            ? displayQuestion
            : `${displayQuestion} / ${questionsPerRound}`}
        </strong>
      </div>
      <div>
        <span className="label">Score</span>
        <strong>
          {totalCorrect} / {totalQuestions}
        </strong>
      </div>
      <div>
        <span className="label">Nauwkeurig</span>
        <strong>{accuracy}%</strong>
      </div>
    </div>
  );
}
