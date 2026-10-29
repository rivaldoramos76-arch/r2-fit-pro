/** Lê uma foto e reduz para enviar à IA (JPEG). Rótulos usam resolução maior para ficarem legíveis. */
export function redimensionarImagem(file: File, max = 1200, qualidade = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('Não foi possível ler a foto'))
    r.onload = () => {
      const im = new Image()
      im.onerror = () => reject(new Error('Formato de foto não suportado'))
      im.onload = () => {
        const c = document.createElement('canvas')
        const s = Math.min(1, max / Math.max(im.width, im.height))
        c.width = Math.round(im.width * s); c.height = Math.round(im.height * s)
        const ctx = c.getContext('2d')
        if (!ctx) return reject(new Error('Não foi possível processar a foto'))
        ctx.drawImage(im, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', qualidade))
      }
      im.src = r.result as string
    }
    r.readAsDataURL(file)
  })
}
