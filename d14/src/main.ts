import init from '../pkg/image_filters.js'
import type { grayscale, invert, sepia } from '../pkg/image_filters'
import JSZip from 'jszip'

type FilterType = 'original' | 'grayscale' | 'invert' | 'sepia'

interface ImageDataItem {
  id: string
  name: string
  originalData: ImageData
  processedData: ImageData | null
  isProcessed: boolean
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

let wasm: {
  grayscale: typeof grayscale
  invert: typeof invert
  sepia: typeof sepia
} | null = null

const imageMap = new Map<string, ImageDataItem>()
let currentFilter: FilterType = 'original'

const fileInput = document.getElementById('fileInput') as HTMLInputElement
const imageGrid = document.getElementById('imageGrid') as HTMLDivElement
const status = document.getElementById('status') as HTMLParagraphElement

const originalBtn = document.getElementById('originalBtn') as HTMLButtonElement
const grayscaleBtn = document.getElementById('grayscaleBtn') as HTMLButtonElement
const invertBtn = document.getElementById('invertBtn') as HTMLButtonElement
const sepiaBtn = document.getElementById('sepiaBtn') as HTMLButtonElement

const batchProcessBtn = document.getElementById('batchProcessBtn') as HTMLButtonElement
const downloadZipBtn = document.getElementById('downloadZipBtn') as HTMLButtonElement
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement

const progressBar = document.getElementById('progressBar') as HTMLDivElement
const progressFill = document.getElementById('progressFill') as HTMLDivElement
const progressText = document.getElementById('progressText') as HTMLSpanElement

const filterBtns = [originalBtn, grayscaleBtn, invertBtn, sepiaBtn]

async function main() {
  try {
    const wasmModule = await init()
    wasm = wasmModule
    status.textContent = 'Wasm 模块加载成功，请选择图片'
  } catch (err: any) {
    status.textContent = `Wasm 加载失败: ${err.message}`
    console.error('Wasm initialization error:', err)
    return
  }

  fileInput.addEventListener('change', handleFileSelect)
  originalBtn.addEventListener('click', () => setFilter('original'))
  grayscaleBtn.addEventListener('click', () => setFilter('grayscale'))
  invertBtn.addEventListener('click', () => setFilter('invert'))
  sepiaBtn.addEventListener('click', () => setFilter('sepia'))
  batchProcessBtn.addEventListener('click', batchProcessAll)
  downloadZipBtn.addEventListener('click', downloadZip)
  clearBtn.addEventListener('click', clearAll)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function handleFileSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files || files.length === 0) return

  Array.from(files).forEach((file) => {
    if (!file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const maxWidth = 400
        const maxHeight = 300
        let width = img.width
        let height = img.height

        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }

        const finalWidth = Math.floor(width)
        const finalHeight = Math.floor(height)

        const canvas = document.createElement('canvas')
        canvas.width = finalWidth
        canvas.height = finalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, finalWidth, finalHeight)

        const originalData = ctx.getImageData(0, 0, finalWidth, finalHeight)
        const id = generateId()

        const item: ImageDataItem = {
          id,
          name: file.name,
          originalData,
          processedData: null,
          isProcessed: false,
          canvas,
          ctx,
        }

        imageMap.set(id, item)
        createImageCard(item)
        updateControls()
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  })

  fileInput.value = ''
}

function createImageCard(item: ImageDataItem) {
  const card = document.createElement('div')
  card.className = 'image-card'
  card.dataset.id = item.id

  card.appendChild(item.canvas)

  const info = document.createElement('div')
  info.className = 'image-card-info'

  const name = document.createElement('div')
  name.className = 'image-card-name'
  name.textContent = item.name
  info.appendChild(name)

  const statusEl = document.createElement('div')
  statusEl.className = 'image-card-status'
  statusEl.textContent = '已加载'
  statusEl.id = `status-${item.id}`
  info.appendChild(statusEl)

  card.appendChild(info)
  imageGrid.appendChild(card)
}

function setFilter(filter: FilterType) {
  currentFilter = filter
  updateFilterButtons()
}

function updateFilterButtons() {
  filterBtns.forEach((btn) => {
    btn.style.background = 'white'
    btn.style.color = '#667eea'
  })

  const activeBtn = getFilterButton(currentFilter)
  if (activeBtn) {
    activeBtn.style.background = '#667eea'
    activeBtn.style.color = 'white'
  }
}

function getFilterButton(filter: FilterType): HTMLButtonElement | null {
  switch (filter) {
    case 'original':
      return originalBtn
    case 'grayscale':
      return grayscaleBtn
    case 'invert':
      return invertBtn
    case 'sepia':
      return sepiaBtn
    default:
      return null
  }
}

function applyFilterToImage(item: ImageDataItem, filter: FilterType): ImageData {
  const sourceData = item.originalData
  const imageData = new ImageData(
    new Uint8ClampedArray(sourceData.data),
    sourceData.width,
    sourceData.height
  )

  if (filter !== 'original' && wasm) {
    switch (filter) {
      case 'grayscale':
        wasm.grayscale(imageData.data)
        break
      case 'invert':
        wasm.invert(imageData.data)
        break
      case 'sepia':
        wasm.sepia(imageData.data)
        break
    }
  }

  return imageData
}

async function batchProcessAll() {
  if (!wasm || imageMap.size === 0) return

  const items = Array.from(imageMap.values())
  const total = items.length
  let processed = 0

  progressBar.style.display = 'block'
  batchProcessBtn.disabled = true

  for (const item of items) {
    const statusEl = document.getElementById(`status-${item.id}`)
    if (statusEl) {
      statusEl.className = 'image-card-status processing'
      statusEl.textContent = '处理中...'
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        const processedData = applyFilterToImage(item, currentFilter)
        item.processedData = processedData
        item.isProcessed = true

        item.ctx.putImageData(processedData, 0, 0)

        if (statusEl) {
          statusEl.className = 'image-card-status processed'
          statusEl.textContent = getFilterName(currentFilter)
        }

        processed++
        const percent = Math.round((processed / total) * 100)
        progressFill.style.width = `${percent}%`
        progressText.textContent = `${percent}% (${processed}/${total})`

        resolve()
      })
    })
  }

  batchProcessBtn.disabled = false
  downloadZipBtn.disabled = false
  status.textContent = `批量处理完成！共处理 ${total} 张图片，可点击打包下载`
}

function getFilterName(filter: FilterType): string {
  switch (filter) {
    case 'original':
      return '原图'
    case 'grayscale':
      return '灰度化'
    case 'invert':
      return '反色'
    case 'sepia':
      return '复古'
    default:
      return filter
  }
}

async function downloadZip() {
  if (imageMap.size === 0) return

  const zip = new JSZip()
  const filterName = getFilterName(currentFilter)

  status.textContent = '正在生成 ZIP 文件...'

  for (const item of imageMap.values()) {
    const canvas = item.canvas
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png')
    })

    const baseName = item.name.replace(/\.[^/.]+$/, '')
    zip.file(`${baseName}_${filterName}.png`, blob)
  }

  const zipContent = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipContent)

  const link = document.createElement('a')
  link.href = url
  link.download = `processed_images_${Date.now()}.zip`
  link.click()

  URL.revokeObjectURL(url)
  status.textContent = 'ZIP 文件已下载！'
}

function clearAll() {
  imageMap.clear()
  imageGrid.innerHTML = ''
  progressBar.style.display = 'none'
  progressFill.style.width = '0%'
  progressText.textContent = '0%'
  currentFilter = 'original'
  updateControls()
  updateFilterButtons()
  status.textContent = '已清空，请重新选择图片'
}

function updateControls() {
  const hasImages = imageMap.size > 0
  filterBtns.forEach((btn) => (btn.disabled = !hasImages))
  batchProcessBtn.disabled = !hasImages
  clearBtn.disabled = !hasImages

  if (hasImages) {
    status.textContent = `已加载 ${imageMap.size} 张图片，选择滤镜后点击批量处理`
  }
}

main()
