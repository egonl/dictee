import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

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

const QUESTIONS_PER_ROUND = 10

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

  const speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

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
    const excluded = new Set(nextAsked)
    const options = WATERWEGEN.filter((word) => !excluded.has(word))

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

    if (questionNumber >= QUESTIONS_PER_ROUND) {
      setQuestionNumber(QUESTIONS_PER_ROUND)
      setCurrentWord(null)
      setAnswer('')
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

  const roundFinished = questionNumber === QUESTIONS_PER_ROUND && currentWord === null

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
              {questionNumber === 0 ? 0 : Math.min(questionNumber, QUESTIONS_PER_ROUND)} / {QUESTIONS_PER_ROUND}
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
            <h2>Ronde klaar!</h2>
            <p>
              Je had {roundCorrect} van de {QUESTIONS_PER_ROUND} goed.
            </p>
            <p className="help">Woorden die fout gingen komen straks vaker terug.</p>
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


