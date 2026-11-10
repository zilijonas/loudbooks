import { suggest } from '../../../src/pages/library/match'

const books = ['The Hobbit', 'Dune', 'Hobbs and Shaw', 'A Tale of Two Cities', 'Émile', 'Ghost Hobby'].map((title) => ({ title }))

describe('suggest', () => {
  it('ranks title-start, then word-start, then inside matches', () => {
    expect(suggest(books, 'hob').map((s) => s.item.title)).toEqual(['Hobbs and Shaw', 'The Hobbit', 'Ghost Hobby'])
    expect(suggest(books, 'ob').map((s) => s.item.title)).toEqual(['The Hobbit', 'Hobbs and Shaw', 'Ghost Hobby'])
  })
  it('ignores case and diacritics and locates the match in the original title', () => {
    const [m] = suggest(books, 'EMIL')
    expect(m!.item.title).toBe('Émile')
    expect([m!.start, m!.end]).toEqual([0, 4])
    expect(suggest([{ title: 'Café Society' }], 'cafe soc')[0]).toMatchObject({ start: 0, end: 8 })
  })
  it('caps the list and returns nothing for an empty query', () => {
    expect(suggest(Array.from({ length: 20 }, (_, i) => ({ title: `Book ${i}` })), 'book')).toHaveLength(6)
    expect(suggest(books, '  ')).toEqual([])
  })
})
