import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";
import AnswerArea from "./components/AnswerArea";
import FeedbackSection from "./components/FeedbackSection";
import ListDialog from "./components/ListDialog";
import RoundEndSection from "./components/RoundEndSection";
import StartControls from "./components/StartControls";
import StatsPanel from "./components/StatsPanel";
import celebrationGif from "./assets/thumbs-up.gif";
import { WORD_LISTS, type WordListDefinition } from "./data/wordLists";
import type { LetterFeedback, MistakeEntry } from "./types";
const DEFAULT_LIST_NAME = Object.keys(WORD_LISTS)[0];
const DEFAULT_QUESTION_COUNT = Math.max(
  1,
  WORD_LISTS[DEFAULT_LIST_NAME]?.entries.length ?? 1,
);
const LOCALE = "nl-NL";
const USER_LISTS_STORAGE_KEY = "dictee:userLists";
const loadStoredLists = (): Record<string, WordListDefinition> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(USER_LISTS_STORAGE_KEY);
    if (!stored) {
      return {};
    }
    return JSON.parse(stored) as Record<string, WordListDefinition>;
  } catch {
    return {};
  }
};
type Step = "diag" | "up" | "left" | null;
const normalize = (value: string) =>
  value.toLocaleLowerCase(LOCALE).trim().replace(/\s+/g, " ");
const isSameChar = (a: string, b: string) =>
  a.toLocaleLowerCase(LOCALE) === b.toLocaleLowerCase(LOCALE);
const isCorrectAnswer = (answer: string, target: string) =>
  normalize(answer) === normalize(target);
const shuffleWords = (words: string[]) => {
  const result = [...words];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const buildFeedback = (answer: string, target: string): LetterFeedback[] => {
  // Edit-distance met expliciete operatiekeuze.
  // Substitutie is duurder dan insert/delete, zodat verschuivingen als missing/extra worden gezien.
  const answerChars = [...answer.trim()];
  const targetChars = [...target];
  const rows = targetChars.length;
  const cols = answerChars.length;
  const cost: number[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols + 1 }, () => 0),
  );
  const parent: Step[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols + 1 }, () => null),
  );
  for (let i = 1; i <= rows; i += 1) {
    cost[i][0] = cost[i - 1][0] + 1;
    parent[i][0] = "up";
  }
  for (let j = 1; j <= cols; j += 1) {
    cost[0][j] = cost[0][j - 1] + 1;
    parent[0][j] = "left";
  }
  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      const expected = targetChars[i - 1];
      const actual = answerChars[j - 1];
      const same = isSameChar(expected, actual);
      const diagCost = cost[i - 1][j - 1] + (same ? 0 : 2);
      const upCost = cost[i - 1][j] + 1;
      const leftCost = cost[i][j - 1] + 1;
      const best = Math.min(diagCost, upCost, leftCost);
      cost[i][j] = best;
      // Tie-break:
      // 1) perfecte match diag
      // 2) missing (up)
      // 3) extra (left)
      // 4) substitutie/wrong diag
      if (same && diagCost === best) {
        parent[i][j] = "diag";
      } else if (upCost === best) {
        parent[i][j] = "up";
      } else if (leftCost === best) {
        parent[i][j] = "left";
      } else {
        parent[i][j] = "diag";
      }
    }
  }
  const feedback: LetterFeedback[] = [];
  let i = rows;
  let j = cols;
  while (i > 0 || j > 0) {
    const step = parent[i][j];
    if (step === "up" && i > 0) {
      feedback.push({
        expected: targetChars[i - 1],
        state: "missing",
      });
      i -= 1;
      continue;
    }
    if (step === "left" && j > 0) {
      feedback.push({
        actual: answerChars[j - 1],
        state: "extra",
      });
      j -= 1;
      continue;
    }
    if (i > 0 && j > 0) {
      const expected = targetChars[i - 1];
      const actual = answerChars[j - 1];
      const same = isSameChar(expected, actual);
      feedback.push({
        expected,
        actual,
        state: same ? "correct" : "wrong",
      });
      i -= 1;
      j -= 1;
      continue;
    }
    if (i > 0) {
      feedback.push({
        expected: targetChars[i - 1],
        state: "missing",
      });
      i -= 1;
      continue;
    }
    if (j > 0) {
      feedback.push({
        actual: answerChars[j - 1],
        state: "extra",
      });
      j -= 1;
    }
  }
  feedback.reverse();
  return feedback;
};
const pickDutchFemaleVoice = (voices: SpeechSynthesisVoice[]) => {
  // Browservoices verschillen per OS/browser. We scoren op NL + naam-hints.
  const dutchVoices = voices.filter((voice) =>
    voice.lang.toLocaleLowerCase().startsWith("nl"),
  );
  if (dutchVoices.length === 0) {
    return null;
  }
  const femaleHints = [
    "female",
    "vrouw",
    "woman",
    "colette",
    "hanna",
    "xenia",
    "sofie",
    "claire",
    "anouk",
  ];
  const maleHints = ["male", "man", "frank", "david"];
  const scored = dutchVoices.map((voice) => {
    const name = voice.name.toLocaleLowerCase();
    let score = 0;
    if (femaleHints.some((hint) => name.includes(hint))) {
      score += 3;
    }
    if (maleHints.some((hint) => name.includes(hint))) {
      score -= 3;
    }
    if (voice.default) {
      score += 1;
    }
    return { voice, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].voice;
};

function App() {
  const answerInputRef = useRef<HTMLInputElement>(null);
  // Game state.
  const [round, setRound] = useState(1);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [currentWord, setCurrentWord] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [roundCorrect, setRoundCorrect] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [mistakeCount, setMistakeCount] = useState<Record<string, number>>({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<LetterFeedback[]>([]);
  const [lastResultCorrect, setLastResultCorrect] = useState<boolean | null>(
    null,
  );
  const [lastAttempt, setLastAttempt] = useState("");
  const [lastCorrectWord, setLastCorrectWord] = useState("");
  const [questionsPerRound, setQuestionsPerRound] = useState(
    DEFAULT_QUESTION_COUNT,
  );
  const [customQuestionCount, setCustomQuestionCount] = useState(
    String(DEFAULT_QUESTION_COUNT),
  );
  const [continueUntilCorrect, setContinueUntilCorrect] = useState(false);
  const [roundMistakes, setRoundMistakes] = useState<MistakeEntry[]>([]);
  const [showMistakes, setShowMistakes] = useState(false);
  const [remainingCount, setRemainingCount] = useState(0);
  const [userLists, setUserLists] = useState<Record<string, WordListDefinition>>(
    () => loadStoredLists(),
  );
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      USER_LISTS_STORAGE_KEY,
      JSON.stringify(userLists),
    );
  }, [userLists]);
  const allLists = useMemo(
    () => ({ ...WORD_LISTS, ...userLists }),
    [userLists],
  );
  const listNames = useMemo(() => Object.keys(allLists), [allLists]);
  const baseListName = listNames[0];
  const [activeWordListKey, setActiveWordListKey] = useState(baseListName);
  const activeWordListData =
    allLists[activeWordListKey] ?? allLists[baseListName];
  const activeWordList =
    activeWordListData?.entries ?? allLists[baseListName]?.entries ?? [];
  const activeListRandom = activeWordListData?.random ?? true;
  const celebrationGifSrc = activeWordListData?.gifUrl ?? celebrationGif;
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [newListTitle, setNewListTitle] = useState("");
  const [newListBody, setNewListBody] = useState("");
  const [newListRandom, setNewListRandom] = useState(true);
  const [newListGifUrl, setNewListGifUrl] = useState("");
  const [newListError, setNewListError] = useState<string | null>(null);
  const [listDialogMode, setListDialogMode] = useState<"new" | "edit">("new");
  const [editingListKey, setEditingListKey] = useState<string | null>(null);
  const pendingRef = useRef<string[]>([]);
  const remainingWordsRef = useRef<Set<string>>(new Set());
  const speechSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  // Totaalpercentage over alle gespeelde vragen.
  const accuracy = useMemo(() => {
    if (totalQuestions === 0) {
      return 0;
    }
    return Math.round((totalCorrect / totalQuestions) * 100);
  }, [totalCorrect, totalQuestions]);
  const speakText = (text: string, rate: number, pitch: number) => {
    if (!speechSupported) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const dutchVoice = pickDutchFemaleVoice(window.speechSynthesis.getVoices());
    if (dutchVoice) {
      utterance.voice = dutchVoice;
    }
    utterance.lang = dutchVoice?.lang ?? LOCALE;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    // Stop eventuele vorige utterance zodat herhaal-knoppen niet overlappen.
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
  const speakWord = (word: string) => {
    speakText(word, 0.85, 1.05);
  };
  const speakCelebration = () => {
    speakText("Goed gedaan!", 0.95, 1.15);
  };
  const resetRoundUi = () => {
    setRoundCorrect(0);
    setLastFeedback([]);
    setLastResultCorrect(null);
    setLastAttempt("");
    setLastCorrectWord("");
    setRoundMistakes([]);
    setShowMistakes(false);
  };
  const drawNextWord = (currentMistakes: Record<string, number>) => {
    let pool = pendingRef.current;
    if (pool.length === 0) {
      const mistakeWords = Object.entries(currentMistakes)
        .filter(([, count]) => count > 0)
        .map(([word]) => word);
      const remainingWords = Array.from(remainingWordsRef.current);
      if (continueUntilCorrect && remainingWords.length === 0) {
        return null;
      }
      const base =
        mistakeWords.length > 0
          ? mistakeWords
          : continueUntilCorrect
            ? remainingWords
            : activeWordList;
      pool = activeListRandom ? shuffleWords(base) : [...base];
    }
    const [nextWord, ...rest] = pool;
    pendingRef.current = rest;
    return nextWord ?? (continueUntilCorrect ? null : activeWordList[0]);
  };
  const startRound = () => {
    remainingWordsRef.current = new Set(activeWordList);
    setRemainingCount(activeWordList.length);
    const firstWord = drawNextWord(mistakeCount);
    if (!firstWord) {
      setQuestionNumber(0);
      setCurrentWord(null);
      setAnswer("");
      return;
    }
    setQuestionNumber(1);
    setCurrentWord(firstWord);
    setAnswer("");
    resetRoundUi();
    speakWord(firstWord);
  };
  const goToStartScreen = () => {
    if (speechSupported) {
      window.speechSynthesis.cancel();
    }
    setQuestionNumber(0);
    setCurrentWord(null);
    setAnswer("");
    resetRoundUi();
    setIsSpeaking(false);
    pendingRef.current = [];
    remainingWordsRef.current = new Set();
    setRemainingCount(0);
  };
  const handleWordListChange = (key: string) => {
    setActiveWordListKey(key);
    const listCount = allLists[key]?.entries.length ?? activeWordList.length;
    const nextCount = Math.max(listCount, 1);
    setQuestionsPerRound(nextCount);
    setCustomQuestionCount(String(nextCount));
    goToStartScreen();
  };
  const handleDeleteList = () => {
    if (WORD_LISTS[activeWordListKey] || !userLists[activeWordListKey]) {
      return;
    }

    setUserLists((previous) => {
      const next = { ...previous };
      delete next[activeWordListKey];
      const nextNames = Object.keys({ ...WORD_LISTS, ...next });
      setActiveWordListKey(nextNames[0]);
      return next;
    });
  };
  const resetNewListDialog = () => {
    setNewListTitle("");
    setNewListBody("");
    setNewListRandom(true);
    setNewListGifUrl("");
    setNewListError(null);
  };

  const ensureUniqueListKey = (desired: string, originalKey?: string | null) => {
    let candidate = desired;
    let suffix = 1;

    while (allLists[candidate] && candidate !== originalKey) {
      candidate = `${desired} (${suffix})`;
      suffix += 1;
    }

    return candidate;
  };

  const openNewListDialog = () => {
    resetNewListDialog();
    setListDialogMode("new");
    setEditingListKey(null);
    setShowNewListDialog(true);
  };

  const openEditListDialog = () => {
    const data = allLists[activeWordListKey];
    if (!data) {
      return;
    }

    setNewListTitle(activeWordListKey);
    setNewListBody(data.entries.join("\n"));
    setNewListRandom(data.random);
    setNewListGifUrl(data.gifUrl ?? "");
    setNewListError(null);
    setListDialogMode("edit");
    setEditingListKey(activeWordListKey);
    setShowNewListDialog(true);
  };

  const closeListDialog = () => {
    resetNewListDialog();
    setListDialogMode("new");
    setEditingListKey(null);
    setShowNewListDialog(false);
  };
  const handleSaveList = () => {
    const title = newListTitle.trim();
    if (!title) {
      setNewListError("Vul een titel in.");
      return;
    }

    const entries = newListBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const gifUrl = newListGifUrl.trim();

    if (entries.length === 0) {
      setNewListError("Geef minimaal één woord of zin op.");
      return;
    }

    const originalKey = listDialogMode === "edit" ? editingListKey : null;
    const targetKey = ensureUniqueListKey(title, originalKey);

    setUserLists((previous) => {
      const next = { ...previous };

      if (originalKey && originalKey !== targetKey) {
        delete next[originalKey];
      }

      next[targetKey] = {
        entries,
        random: newListRandom,
        gifUrl: gifUrl.length > 0 ? gifUrl : undefined,
      };

      return next;
    });

    setActiveWordListKey(targetKey);
    const nextCount = Math.max(entries.length, 1);
    setQuestionsPerRound(nextCount);
    setCustomQuestionCount(String(nextCount));
    resetRoundUi();
    pendingRef.current = [];
    closeListDialog();
  };
  const handleQuestionCountChange = (value: string) => {
    setCustomQuestionCount(value);
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      return;
    }
    const clamped = Math.min(100, Math.max(1, parsed));
    setQuestionsPerRound(clamped);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWord) {
      return;
    }
    const correct = isCorrectAnswer(answer, currentWord);
    const feedback = buildFeedback(answer, currentWord);
    setLastFeedback(feedback);
    setLastResultCorrect(correct);
    setLastAttempt(answer.trim());
    setLastCorrectWord(currentWord);
    setTotalQuestions((previous) => previous + 1);
    if (!correct) {
      setRoundMistakes((previous) => [
        ...previous,
        { word: currentWord, answer: answer.trim(), feedback },
      ]);
    }
    // Snapshot wordt meteen gebruikt voor de volgende gewogen selectie.
    let nextMistakeCount = mistakeCount;
    if (correct) {
      setRoundCorrect((previous) => previous + 1);
      setTotalCorrect((previous) => previous + 1);
      nextMistakeCount = { ...mistakeCount };
      delete nextMistakeCount[currentWord];
      if (continueUntilCorrect) {
        const removed = remainingWordsRef.current.delete(currentWord);
        if (removed) {
          setRemainingCount((previous) => Math.max(0, previous - 1));
        }
      }
    } else {
      nextMistakeCount = {
        ...mistakeCount,
        [currentWord]: (mistakeCount[currentWord] ?? 0) + 1,
      };
    }
    setMistakeCount(nextMistakeCount);
    if (
      continueUntilCorrect
        ? remainingWordsRef.current.size === 0
        : questionNumber >= questionsPerRound
    ) {
      // Einde ronde: geen nieuw woord meer klaarzetten.
      if (!continueUntilCorrect) {
        setQuestionNumber(questionsPerRound);
      }
      setCurrentWord(null);
      setAnswer("");
      speakCelebration();
      return;
    }
    const nextWord = drawNextWord(nextMistakeCount);
    if (!nextWord) {
      setCurrentWord(null);
      return;
    }
    setQuestionNumber((previous) => previous + 1);
    setCurrentWord(nextWord);
    setAnswer("");
    speakWord(nextWord);
  };
  const startNextRound = () => {
    setRound((previous) => previous + 1);
    startRound();
  };
  const canDeleteActiveList =
    !WORD_LISTS[activeWordListKey] && Boolean(userLists[activeWordListKey]);
  const roundFinished =
    currentWord === null &&
    (continueUntilCorrect
      ? remainingCount === 0
      : questionNumber >= questionsPerRound);
  const isStartScreen = questionNumber === 0;
  // Houd focus op het invoerveld tijdens actief dictee.
  useEffect(() => {
    if (currentWord) {
      answerInputRef.current?.focus();
    }
  }, [currentWord]);
  return (
    <main className="app-shell">
      <div className="decor decor-left" />
      <div className="decor decor-right" />
      {isStartScreen ? (
        <section className="card start-card">
          <h1>Welkom bij dictee</h1>
          <p className="subtitle">
            Kies een woordenlijst, stel je ronde in en start het dictee.
          </p>
          <StartControls
            listNames={listNames}
            activeWordListKey={activeWordListKey}
            customQuestionCount={customQuestionCount}
            continueUntilCorrect={continueUntilCorrect}
            onListChange={handleWordListChange}
            onCustomChange={handleQuestionCountChange}
            onContinueUntilCorrectChange={setContinueUntilCorrect}
            onStart={startRound}
            onNewList={openNewListDialog}
            onEditList={openEditListDialog}
            onDeleteList={handleDeleteList}
            canDeleteList={canDeleteActiveList}
          />
        </section>
      ) : (
        <section className="card">
          <div className="top-actions">
            <button
              className="btn secondary icon-btn"
              onClick={goToStartScreen}
              type="button"
              aria-label="Startscherm"
              title="Startscherm"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                className="icon-home"
              >
                <path
                  d="M3 10.5L12 3l9 7.5M6.75 8.25V21h10.5V8.25"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <h1>Dictee: {activeWordListKey}</h1>
          <p className="subtitle">
            Luister goed, typ het woord en check je spelling per letter.
          </p>
          <StatsPanel
            round={round}
            questionNumber={questionNumber}
            questionsPerRound={questionsPerRound}
            totalCorrect={totalCorrect}
            totalQuestions={totalQuestions}
            accuracy={accuracy}
            isUnlimited={continueUntilCorrect}
          />
          {currentWord && (
            <AnswerArea
              answer={answer}
              onAnswerChange={(value) => setAnswer(value)}
              onSubmit={handleSubmit}
              onReplay={() => {
                speakWord(currentWord);
                answerInputRef.current?.focus();
              }}
              isSpeaking={isSpeaking}
              speechSupported={speechSupported}
              inputRef={answerInputRef}
            />
          )}
          {lastResultCorrect !== null && (
            <FeedbackSection
              lastResultCorrect={lastResultCorrect}
              lastAttempt={lastAttempt}
              lastCorrectWord={lastCorrectWord}
              feedback={lastFeedback}
            />
          )}
          {roundFinished && (
            <RoundEndSection
              roundCorrect={roundCorrect}
              questionsPerRound={questionsPerRound}
              roundMistakes={roundMistakes}
              showMistakes={showMistakes}
              onToggleMistakes={() => setShowMistakes((prev) => !prev)}
              speechSupported={speechSupported}
              onNextRound={startNextRound}
              celebrationGifSrc={celebrationGifSrc}
            />
          )}
        </section>
      )}
      <ListDialog
        show={showNewListDialog}
        mode={listDialogMode}
        title={newListTitle}
        body={newListBody}
        random={newListRandom}
        gifUrl={newListGifUrl}
        error={newListError}
        onClose={closeListDialog}
        onSave={handleSaveList}
        onTitleChange={setNewListTitle}
        onBodyChange={setNewListBody}
        onRandomChange={setNewListRandom}
        onGifUrlChange={setNewListGifUrl}
      />
    </main>
  );
}

export default App;
