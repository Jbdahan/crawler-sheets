import { useEffect, useState } from 'react'
import LZString from 'lz-string'
import QRCode from 'qrcode'
import type { Character } from '../engine/types'
import { useStore } from '../store/characters'
import { Sheet, toast } from '../components/ui'

/** Byte-mode QR codes top out near 2,950 characters at low error correction. */
const QR_LIMIT = 2900

export function fileName(c: Character) {
  return `${(c.name || 'crawler').replace(/[^\w-]+/g, '_')}.dcc.json`
}

export function shareUrl(c: Character) {
  // portraits make links huge; the file export keeps them
  const { portrait: _portrait, log: _log, ...rest } = c
  void _portrait
  void _log
  const data = LZString.compressToEncodedURIComponent(JSON.stringify(rest))
  return `${location.origin}${location.pathname}#import=${data}`
}

export async function exportFile(c: Character) {
  const blob = new Blob([JSON.stringify(c, null, 1)], { type: 'application/json' })
  const file = new File([blob], fileName(c), { type: 'application/json' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: c.name || 'Crawler' })
      return true
    } catch {
      // user cancelled the share sheet; fall back to a download
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName(c)
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return true
}

export function ShareSheet({ c, onClose }: { c: Character; onClose: () => void }) {
  const markBackedUp = useStore((s) => s.markBackedUp)
  const url = shareUrl(c)
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    if (url.length > QR_LIMIT) return
    QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'L' }).then(setQr).catch(() => setQr(null))
  }, [url])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied')
    } catch {
      toast("Couldn't copy; long-press the link instead")
    }
  }
  return (
    <Sheet title="Share / back up" onClose={onClose}>
      <div className="stack">
        <button className="btn primary" onClick={async () => { await exportFile(c); markBackedUp(); toast('Exported') }}>Export file (AirDrop, Messages, Files)</button>
        <p className="small muted">The file is a full backup, including the portrait and history. Import it from the roster screen on any device.</p>
        <div className="divider" />
        <div className="label">Link</div>
        <p className="small muted">Opening this link in the app imports a copy of this crawler (without the portrait).</p>
        <button className="btn" onClick={copy}>Copy import link</button>
        {qr ? (
          <div className="center">
            <img src={qr} alt="QR code that imports this crawler" style={{ width: 240, height: 240, background: '#fff', borderRadius: 8, padding: 6 }} />
            <div className="small muted">Scan with another player's camera while the app is hosted at the same address.</div>
          </div>
        ) : (
          <div className="infobox small">This crawler is too big for a QR code. Use the file or the link instead.</div>
        )}
      </div>
    </Sheet>
  )
}

export function decodeImport(data: string): unknown {
  const json = LZString.decompressFromEncodedURIComponent(data)
  if (!json) throw new Error('bad data')
  return JSON.parse(json)
}
