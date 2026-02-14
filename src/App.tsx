import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import celebrationGif from './assets/thumbs-up.gif'

// Basisset woorden voor dit eerste dictee-thema.
const WATERWEGEN = [
  'Waddenzee',
  'IJsselmeer',
  'Markermeer',
  'IJssel',
  'Nederrijn',
  'Waal',
  'Maas',
  'Noordzeekanaal',
  'Amsterdam-Rijnkanaal',
  'Lek',
  'Nieuwe Waterweg',
  'Oosterschelde',
  'Westerschelde',
]

const PRESET_QUESTION_COUNTS = [5, 10, 15, 20, 30]

type LetterState = 'correct' | 'wrong' | 'missing' | 'extra'

type LetterFeedback = {
  expected?: string
  actual?: string
  state: LetterState
}

const normalize = (value: string) =>
  value.toLocaleLowerCase('nl-NL').trim().replace(/\s+/g, ' ')

const isCorrectAnswer = (answer: string, target: string) =>
  normalize(answer) === normalize(target)

const pickWeightedWord = (
  options: string[],
  mistakeCount: Record<string, number>,
) => {
  // Woorden met meer fouten krijgen hogere kans om terug te komen.
  const weights = options.map((word) => 1 + (mistakeCount[word] ?? 0) * 3)
  const totalWeight = weights.reduce((sum, value) => sum + value, 0)

  if (totalWeight <= 0) {
    return options[Math.floor(Math.random() * options.length)]
  }

  let random = Math.random() * totalWeight
  for (let i = 0; i < options.length; i += 1) {
    random -= weights[i]
    if (random <= 0) {
      return options[i]
    }
  }

  return options[options.length - 1]
}

const charLabel = (char: string) => {
  if (char === ' ') {
    return 'spatie'
  }
  return char
}

const buildFeedback = (answer: string, target: string): LetterFeedback[] => {
  // Vergelijk letter-voor-letter zodat de UI precies kan tonen wat goed/fout/mist/extra is.
  const cleanedAnswer = answer.trim()
  const answerChars = [...cleanedAnswer]
  const targetChars = [...target]
  const length = Math.max(answerChars.length, targetChars.length)
  const feedback: LetterFeedback[] = []

  for (let i = 0; i < length; i += 1) {
    const expected = targetChars[i]
    const actual = answerChars[i]

    if (expected === undefined && actual !== undefined) {
      feedback.push({ actual, state: 'extra' })
      continue
    }

    if (expected !== undefined && actual === undefined) {
      feedback.push({ expected, state: 'missing' })
      continue
    }

    if (expected !== undefined && actual !== undefined) {
      const isMatch =
        expected.toLocaleLowerCase('nl-NL') ===
        actual.toLocaleLowerCase('nl-NL')

      feedback.push({
        expected,
        actual,
        state: isMatch ? 'correct' : 'wrong',
      })
    }
  }

  return feedback
}

const pickDutchFemaleVoice = (voices: SpeechSynthesisVoice[]) => {
  // Browservoices verschillen per OS/browser. We scoren op NL + naam-hints.
  const dutchVoices = voices.filter((voice) =>
    voice.lang.toLocaleLowerCase().startsWith('nl'),
  )

  if (dutchVoices.length === 0) {
    return null
  }

  const femaleHints = [
    'female',
    'vrouw',
    'woman',
    'colette',
    'hanna',
    'xenia',
    'sofie',
    'claire',
    'anouk',
  ]
  const maleHints = ['male', 'man', 'frank', 'david']

  const scored = dutchVoices.map((voice) => {
    const name = voice.name.toLocaleLowerCase()
    let score = 0

    if (femaleHints.some((hint) => name.includes(hint))) {
      score += 3
    }
    if (maleHints.some((hint) => name.includes(hint))) {
      score -= 3
    }
    if (voice.default) {
      score += 1
    }

    return { voice, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].voice
}

function App() {
  const answerInputRef = useRef<HTMLInputElement>(null)
  // Game state.
  const [round, setRound] = useState(1)
  const [questionNumber, setQuestionNumber] = useState(0)
  const [currentWord, setCurrentWord] = useState<string | null>(null)
  const [askedThisRound, setAskedThisRound] = useState<string[]>([])
  const [answer, setAnswer] = useState('')
  const [roundCorrect, setRoundCorrect] = useState(0)
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [mistakeCount, setMistakeCount] = useState<Record<string, number>>({})
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [lastFeedback, setLastFeedback] = useState<LetterFeedback[]>([])
  const [lastResultCorrect, setLastResultCorrect] = useState<boolean | null>(null)
  const [lastAttempt, setLastAttempt] = useState('')
  const [lastCorrectWord, setLastCorrectWord] = useState('')
  const [questionsPerRound, setQuestionsPerRound] = useState(10)
  const [customQuestionCount, setCustomQuestionCount] = useState('')

  const speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  // Totaalpercentage over alle gespeelde vragen.
  const accuracy = useMemo(() => {
    if (totalQuestions === 0) {
      return 0
    }
    return Math.round((totalCorrect / totalQuestions) * 100)
  }, [totalCorrect, totalQuestions])

  const prepareNextWord = (
    nextAsked: string[],
    mistakesSnapshot: Record<string, number>,
  ) => {
    // Binnen 1 ronde tonen we woorden eerst uniek. Is de lijst op, dan hergebruiken we.
    const excluded = new Set(nextAsked)
    const uniqueOptions = WATERWEGEN.filter((word) => !excluded.has(word))
    const options = uniqueOptions.length > 0 ? uniqueOptions : WATERWEGEN

    if (options.length === 0) {
      return null
    }

    return pickWeightedWord(options, mistakesSnapshot)
  }

  const speakWord = (word: string) => {
    if (!speechSupported) {
      return
    }

    const utterance = new SpeechSynthesisUtterance(word)
    const dutchVoice = pickDutchFemaleVoice(window.speechSynthesis.getVoices())

    if (dutchVoice) {
      utterance.voice = dutchVoice
    }

    utterance.lang = dutchVoice?.lang ?? 'nl-NL'
    utterance.rate = 0.85
    utterance.pitch = 1.05
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    // Stop eventuele vorige utterance zodat herhaal-knoppen niet overlappen.
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const speakCelebration = () => {
    if (!speechSupported) {
      return
    }

    const utterance = new SpeechSynthesisUtterance('Goed gedaan!')
    const dutchVoice = pickDutchFemaleVoice(window.speechSynthesis.getVoices())

    if (dutchVoice) {
      utterance.voice = dutchVoice
    }

    utterance.lang = dutchVoice?.lang ?? 'nl-NL'
    utterance.rate = 0.95
    utterance.pitch = 1.15

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const startRound = () => {
    const firstWord = pickWeightedWord(WATERWEGEN, mistakeCount)

    setQuestionNumber(1)
    setCurrentWord(firstWord)
    setAskedThisRound([firstWord])
    setAnswer('')
    setRoundCorrect(0)
    setLastFeedback([])
    setLastResultCorrect(null)

    speakWord(firstWord)
  }

  const goToStartScreen = () => {
    if (speechSupported) {
      window.speechSynthesis.cancel()
    }

    setQuestionNumber(0)
    setCurrentWord(null)
    setAskedThisRound([])
    setAnswer('')
    setRoundCorrect(0)
    setLastFeedback([])
    setLastResultCorrect(null)
    setLastAttempt('')
    setLastCorrectWord('')
    setIsSpeaking(false)
  }

  const applyCustomQuestionCount = () => {
    const parsed = Number.parseInt(customQuestionCount, 10)
    if (Number.isNaN(parsed)) {
      return
    }

    const clamped = Math.min(100, Math.max(1, parsed))
    setQuestionsPerRound(clamped)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!currentWord) {
      return
    }

    const correct = isCorrectAnswer(answer, currentWord)
    const feedback = buildFeedback(answer, currentWord)

    setLastFeedback(feedback)
    setLastResultCorrect(correct)
    setLastAttempt(answer.trim())
    setLastCorrectWord(currentWord)
    setTotalQuestions((previous) => previous + 1)

    // Snapshot wordt meteen gebruikt voor de volgende gewogen selectie.
    let nextMistakeCount = mistakeCount

    if (correct) {
      setRoundCorrect((previous) => previous + 1)
      setTotalCorrect((previous) => previous + 1)
      nextMistakeCount = {
        ...mistakeCount,
        [currentWord]: Math.max((mistakeCount[currentWord] ?? 0) - 1, 0),
      }
    } else {
      nextMistakeCount = {
        ...mistakeCount,
        [currentWord]: (mistakeCount[currentWord] ?? 0) + 1,
      }
    }

    setMistakeCount(nextMistakeCount)

    if (questionNumber >= questionsPerRound) {
      // Einde ronde: geen nieuw woord meer klaarzetten.
      setQuestionNumber(questionsPerRound)
      setCurrentWord(null)
      setAnswer('')
      speakCelebration()
      return
    }

    const nextAsked = [...askedThisRound, currentWord]
    const nextWord = prepareNextWord(nextAsked, nextMistakeCount)

    if (!nextWord) {
      setCurrentWord(null)
      return
    }

    setQuestionNumber((previous) => previous + 1)
    setAskedThisRound((previous) => [...previous, nextWord])
    setCurrentWord(nextWord)
    setAnswer('')

    speakWord(nextWord)
  }

  const startNextRound = () => {
    setRound((previous) => previous + 1)
    startRound()
  }

  const roundFinished = questionNumber >= questionsPerRound && currentWord === null

  // Houd focus op het invoerveld tijdens actief dictee.
  useEffect(() => {
    if (currentWord) {
      answerInputRef.current?.focus()
    }
  }, [currentWord])

  return (
    <main className="app-shell">
      <div className="decor decor-left" />
      <div className="decor decor-right" />

      <section className="card">
        <div className="top-actions">
          <button className="btn secondary" onClick={goToStartScreen} type="button">
            Terug naar begin
          </button>
        </div>
        <h1>Dictee van Nederlandse Wateren</h1>
        <p className="subtitle">Luister goed, typ het woord en check je spelling per letter.</p>

        <div className="stats">
          <div>
            <span className="label">Ronde</span>
            <strong>{round}</strong>
          </div>
          <div>
            <span className="label">Vraag</span>
            <strong>
              {questionNumber === 0 ? 0 : Math.min(questionNumber, questionsPerRound)} / {questionsPerRound}
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

        {questionNumber === 0 && (
          <div className="center-block">
            <p className="help">Druk op start en luister naar de uitgesproken waterweg.</p>
            <div className="question-picker">
              {PRESET_QUESTION_COUNTS.map((count) => (
                <button
                  key={count}
                  className={`btn choice ${questionsPerRound === count ? 'active' : ''}`}
                  onClick={() => setQuestionsPerRound(count)}
                  type="button"
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
                onChange={(event) => setCustomQuestionCount(event.target.value)}
                placeholder="Bijv. 12"
              />
              <button className="btn secondary" onClick={applyCustomQuestionCount} type="button">
                Gebruik aantal
              </button>
            </div>
            <p className="help">Nu ingesteld: {questionsPerRound} vragen per ronde.</p>
            <button className="btn primary" onClick={startRound}>
              Start dictee
            </button>
          </div>
        )}

        {currentWord && (
          <>
            <div className="speak-row">
              <button
                className="btn secondary"
                onClick={() => {
                  speakWord(currentWord)
                  answerInputRef.current?.focus()
                }}
              >
                {isSpeaking ? 'Aan het voorlezen...' : 'Lees het woord opnieuw voor'}
              </button>
              {!speechSupported && <p className="warn">Je browser ondersteunt geen voorleesfunctie.</p>}
            </div>

            <form className="answer-form" onSubmit={handleSubmit}>
              <label htmlFor="answer">Typ de waterweg:</label>
              <input
                ref={answerInputRef}
                id="answer"
                autoComplete="off"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Bijv. Waddenzee"
                required
              />
              <button className="btn primary" type="submit">
                Controleer
              </button>
            </form>
          </>
        )}

        {lastResultCorrect !== null && (
          <section className="feedback">
            <h2>{lastResultCorrect ? 'Goed gedaan!' : 'Bijna, probeer de volgende!'}</h2>
            {!lastResultCorrect && (
              <p className="word-compare">
                <strong>Jij typte:</strong> {lastAttempt || '(leeg)'}
                <br />
                <strong>Goed is:</strong> {lastCorrectWord}
              </p>
            )}
            <div className="letter-grid">
              {lastFeedback.map((item, index) => (
                <span key={`${item.expected ?? item.actual}-${index}`} className={`letter ${item.state}`}>
                  {item.state === 'extra' && item.actual ? `+ ${charLabel(item.actual)}` : null}
                  {item.state === 'missing' && item.expected ? `? ${charLabel(item.expected)}` : null}
                  {(item.state === 'correct' || item.state === 'wrong') && item.expected
                    ? charLabel(item.expected)
                    : null}
                </span>
              ))}
            </div>
            <p className="legend">
              <span className="chip correct">Goed</span>
              <span className="chip wrong">Fout</span>
              <span className="chip missing">Mist</span>
              <span className="chip extra">Extra</span>
            </p>
          </section>
        )}

        {roundFinished && (
          <section className="round-end">
            <img
              className="celebration-gif"
              src={celebrationGif}
              alt="Enthousiaste thumbs up"
            />
            <p className="mascot-text">Goed gedaan!</p>
            <h2>Ronde klaar!</h2>
            <p>
              Je had {roundCorrect} van de {questionsPerRound} goed.
            </p>
            <p className="help">Woorden die fout gingen komen straks vaker terug.</p>
            <div className="round-end-actions">
              <button className="btn secondary" onClick={speakCelebration} type="button">
                Zeg het nog eens
              </button>
              {!speechSupported && (
                <p className="warn">Deze browser ondersteunt geen voorleesfunctie.</p>
              )}
            </div>
            <button className="btn primary" onClick={startNextRound}>
              Nieuwe ronde
            </button>
          </section>
        )}
      </section>
    </main>
  )
}

export default App



