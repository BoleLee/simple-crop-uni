export const getObjectURL = (file) => {
  let url = null
  if (window.createObjectURL !== undefined) { // basic
    url = window.createObjectURL(file)
  } else if (window.URL !== undefined) { // mozilla(firefox)
    url = window.URL.createObjectURL(file)
  } else if (window.webkitURL !== undefined) { // webkit or chrome
    url = window.webkitURL.createObjectURL(file)
  }
  return url
}

export const revokeObjectUrl = (url) => {
  if (window.revokeObjectURL !== undefined) { // basic
    window.revokeObjectURL(url)
  } else if (window.URL !== undefined) { // mozilla(firefox)
    window.URL.revokeObjectURL(url)
  } else if (window.webkitURL !== undefined) { // webkit or chrome
    window.webkitURL.revokeObjectURL(url)
  }
}

export const base64ToBlob = (base64) => {
  const parts = base64.split(';base64,')
  const contentType = parts[0].split(':')[1]
  const raw = window.atob(parts[1])
  const rawLength = raw.length

  const uInt8Array = new Uint8Array(rawLength)

  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i)
  }
  return new Blob([uInt8Array], { type: contentType })
}

/**
 * H5端压缩图片
 * @param {File} file 必须，图片File对象，含{path, size}
 * @param {Number} quality 可选，0-1, 图片压缩质量
 * @param {DOMString} type 可选，指定图片格式，默认'image/png'
 * @param {Number} size 可选，单位与file.size一致，默认256000, 小于这个值则不压缩图片
 * @param {Number} length 可选，图片宽度或高度超过这个值则压缩，默认500
 *
 * @return {String} 压缩后的图片路径
 */
export const compressImage = (options) => {
  return new Promise((resolve, reject) => {
    const limitedSize = options.size || 256000
    const limitedLength = options.length || 500
    if (options.file.size < limitedSize) {
      resolve(options.file.path)
    } else {
      uni.getImageInfo({
        src: options.file.path,
        success (res) {
          if (res.width < limitedLength && res.height < limitedLength) {
            resolve(res.path)
          } else {
            const originWidth = res.width
            const originHeight = res.height
            const img = new Image()
            img.src = res.path
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            // 压缩规则
            let canvasWidth
            let canvasHeight
            if (originWidth >= originHeight) {
              canvasWidth = limitedLength
              canvasHeight = Math.floor(originHeight * canvasWidth / originWidth)
            } else {
              canvasHeight = limitedLength
              canvasWidth = Math.floor(originWidth * canvasHeight / originHeight)
            }
            canvas.width = canvasWidth
            canvas.height = canvasHeight
            ctx.drawImage(img, 0, 0, originWidth, originHeight, 0, 0, canvasWidth, canvasHeight)
            uni.showLoading({
              title: '压缩中...',
              mask: true
            })
            canvas.toBlob(function (blob) {
              const resultPath = getObjectURL(blob)
              uni.hideLoading()
              resolve(resultPath)
            }, options.type || 'image/png', options.quality)
          }
        }
      })
    }
  })
}
