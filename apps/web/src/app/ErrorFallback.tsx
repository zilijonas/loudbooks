import { Ic } from '../components/icons'
import { Button } from '../components/ui/Button'
import { t } from '../i18n'
import '../pages/screens.css'

/** A8: storage could not be opened (private window, cleared site data). Outside the Shell, so plain links. */
export function ErrorFallback() {
  return (
    <main role="alert" className="lb-dataerror">
      <div><Ic name="drive" size={30} /></div>
      <h1>{t('dataError.title')}</h1>
      <p>{t('dataError.body')}</p>
      <div>
        <Button size="dialog" onClick={() => location.reload()}>{t('common.tryAgain')}</Button>
        <Button size="dialog" variant="secondary" onClick={() => { location.hash = '#/settings'; location.reload() }}>{t('dataError.openSettings')}</Button>
      </div>
    </main>
  )
}
