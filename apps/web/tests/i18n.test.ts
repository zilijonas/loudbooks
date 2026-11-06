import { t } from '../src/i18n'

describe('t', () => {
  it('interpolates {name}', () => {
    expect(t('dialogs.deleteTitle', { title: 'Dune' })).toBe('Delete “Dune”?')
  })
  it('picks plural forms and fills #', () => {
    expect(t('library.subtitle', { count: 1 })).toContain('1 book on')
    expect(t('library.subtitle', { count: 3 })).toContain('3 books on')
  })
  it('keeps unknown params visible', () => {
    expect(t('library.left')).toBe('{duration} left')
  })
})
