import type { ReactNode } from 'react'

type Part = string | React.JSX.Element

/** Wraps the first occurrence of each word in <strong> (the design bolds button names inside step copy). */
export function emph(text: string, ...words: string[]): ReactNode {
  let nodes: Part[] = [text]
  for (const word of words) {
    nodes = nodes.flatMap((n): Part[] => {
      if (typeof n !== 'string') return [n]
      const i = n.indexOf(word)
      return i < 0 ? [n] : [n.slice(0, i), <strong key={word}>{word}</strong>, n.slice(i + word.length)]
    })
  }
  return <>{nodes}</>
}
