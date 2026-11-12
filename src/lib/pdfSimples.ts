// Gerador de PDF pequeno e sem dependências (testado em tests/logica.test.ts): texto com acentos (Helvetica, WinAnsi),
// títulos, linhas e quebra de página automática. Suficiente para treino, dieta e relatório.

const W = 595, H = 842, MARGEM = 48

/** Caracteres fora do Latin-1 que existem no WinAnsi (aspas curvas, travessão, marcador...). */
const EXTRA: Record<string, number> = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '×': 0xd7 }

/** Texto para bytes WinAnsi dentro de ( ) no PDF; o que não existe vira "?" (emojis saem). */
export function winAnsi(s: string): string {
  let out = ''
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0)!
    const b = EXTRA[ch] ?? (c >= 32 && c < 127 ? c : c >= 160 && c <= 255 ? c : c === 10 ? -1 : (/\p{Extended_Pictographic}|️/u.test(ch) ? -2 : 63))
    if (b === -1 || b === -2) continue
    const t = String.fromCharCode(b)
    out += t === '(' || t === ')' || t === '\\' ? '\\' + t : t
  }
  return out
}

// Larguras aproximadas da Helvetica (em milésimos do tamanho da fonte)
const LARG: Record<string, number> = { ' ': 278, i: 222, l: 222, j: 222, f: 278, t: 278, r: 333, I: 278, '.': 278, ',': 278, ':': 278, ';': 278, '|': 260, '!': 278, "'": 191, '(': 333, ')': 333, '-': 333, m: 833, w: 722, M: 833, W: 944 }
const largura = (s: string, tam: number, negrito: boolean) =>
  [...s].reduce((t, ch) => t + (LARG[ch] ?? (/[A-ZÀ-Ý]/.test(ch) ? 667 : /[0-9]/.test(ch) ? 556 : 540)), 0) * tam / 1000 * (negrito ? 1.06 : 1)

export interface EstiloTexto { tamanho?: number; negrito?: boolean; cor?: [number, number, number]; recuo?: number; espacoAntes?: number }

export class DocPdf {
  private paginas: string[] = []
  private atual = ''
  private y = H - MARGEM

  constructor(private titulo: string, private rodape = 'R2 Fit Pro · r2fitpro.com.br') { this.novaPagina() }

  private novaPagina() {
    if (this.atual) this.paginas.push(this.atual)
    this.atual = ''
    this.y = H - MARGEM
    // faixa verde no topo com o título
    this.atual += `0.13 0.77 0.37 rg 0 ${H - 28} ${W} 28 re f\n`
    this.atual += `BT /F2 11 Tf 1 1 1 rg ${MARGEM} ${H - 19} Td (${winAnsi(this.titulo)}) Tj ET\n`
    this.atual += `BT /F1 8 Tf 0.45 0.45 0.48 rg ${MARGEM} 24 Td (${winAnsi(this.rodape)}) Tj ET\n`
    this.y = H - 28 - 30
  }

  private garantir(altura: number) { if (this.y - altura < 48) this.novaPagina() }

  /** Texto com quebra de linha automática. */
  texto(t: string, e: EstiloTexto = {}) {
    const tam = e.tamanho ?? 10, neg = !!e.negrito, recuo = e.recuo ?? 0
    const [r, g, b] = e.cor ?? [0.1, 0.1, 0.12]
    const maxL = W - 2 * MARGEM - recuo
    this.y -= e.espacoAntes ?? 0
    for (const par of t.split('\n')) {
      const linhas: string[] = []
      let linha = ''
      for (const palavra of par.split(/\s+/).filter(Boolean)) {
        const tenta = linha ? `${linha} ${palavra}` : palavra
        if (largura(tenta, tam, neg) > maxL && linha) { linhas.push(linha); linha = palavra } else linha = tenta
      }
      linhas.push(linha)
      for (const l of linhas) {
        this.garantir(tam * 1.35)
        this.y -= tam * 1.35
        this.atual += `BT /${neg ? 'F2' : 'F1'} ${tam} Tf ${r} ${g} ${b} rg ${MARGEM + recuo} ${this.y.toFixed(1)} Td (${winAnsi(l)}) Tj ET\n`
      }
    }
    return this
  }

  titulo1(t: string) { return this.texto(t, { tamanho: 18, negrito: true, espacoAntes: 4 }) }
  titulo2(t: string) { this.garantir(40); return this.texto(t, { tamanho: 13, negrito: true, cor: [0.08, 0.5, 0.25], espacoAntes: 12 }) }
  espaco(pt = 8) { this.y -= pt; return this }
  linha() {
    this.garantir(10)
    this.y -= 6
    this.atual += `0.85 0.85 0.87 RG 0.6 w ${MARGEM} ${this.y.toFixed(1)} m ${W - MARGEM} ${this.y.toFixed(1)} l S\n`
    this.y -= 4
    return this
  }

  /** Bytes do PDF. */
  gerar(): Uint8Array<ArrayBuffer> {
    if (this.atual) { this.paginas.push(this.atual); this.atual = '' }
    const objs: string[] = []
    const n = this.paginas.length
    // 1 catálogo, 2 páginas, 3 F1, 4 F2, depois (página, conteúdo) por página
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
    const kids = this.paginas.map((_, i) => `${5 + i * 2} 0 R`).join(' ')
    objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    this.paginas.forEach((c, i) => {
      objs[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`
      objs[6 + i * 2] = `<< /Length ${c.length} >>\nstream\n${c}endstream`
    })
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
    const offsets: number[] = []
    for (let i = 1; i < objs.length; i++) { offsets[i] = pdf.length; pdf += `${i} 0 obj\n${objs[i]}\nendobj\n` }
    const xref = pdf.length
    pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
    pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    const bytes = new Uint8Array(new ArrayBuffer(pdf.length))
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff
    return bytes
  }

  blob(): Blob { return new Blob([this.gerar()], { type: 'application/pdf' }) }
}
