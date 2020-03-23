<template>
<view id="simple_crop" class="crop-whole-cover" :style="{ 'z-index': zIndex }">
  <view class="crop-component" @touchend.stop="endControl">
    <view class="crop-mask" @touchstart.stop="touchstart" @touchmove.stop="touchmove">
      <canvas
        type="2d" canvas-id="crop_content"
        class="crop-content"
        :style="contentSize"></canvas>
      <canvas
        type="2d" canvas-id="crop_result"
        class="crop-result"
        :style="resultSize"></canvas>
      <canvas
        type="2d" canvas-id="crop_final"
        class="crop-final"
        :style="finalSize"></canvas>
      <image
        :style="cropContentStyle"
        :src="visibleSrc"></image>
      <canvas
        type="2d" canvas-id="crop_cover"
        class="crop-cover"
        :style="coverSize"></canvas>
    </view>
    <view v-if="rotateSlider" class="crop-rotate">
      <scroll-view :scroll-x="true" :scroll-left="curMoveX" @scroll="scrollLineation">
        <view class="lineation" :style="{ width: lineationWidth + 'px' }">
          <view v-for="item in lineationArr" :key="item">
            <view class="number">{{ item }}</view>
            <view class="bg"></view>
          </view>
        </view>
      </scroll-view>
      <view class="current"></view>
    </view>
    <view class="crop-btns">
      <view v-if="funcBtns.close" @tap="close" class="crop-close"></view>
      <view v-if="funcBtns.around" @tap="around" class="crop-around"></view>
      <view v-if="funcBtns.reset" @tap="reset" class="crop-reset"></view>
      <view v-if="funcBtns.crop" @tap="getCropImage" class="crop-btn"></view>
    </view>
  </view>
</view>
</template>

<script>
const TransformationMatrix = require('./transformation-matrix.js')
const S_ID = 'simple_crop'
const SystemInfo = uni.getSystemInfoSync()

export default {
  name: 'SimpleCrop',
  props: {
    src: {
      type: String,
      default: ''
    },
    size: {
      type: Object,
      default: () => {
        return {
          width: 0,
          height: 0
        }
      }
    },
    zIndex: { // 组件层级
      type: Number,
      default: 999
    },
    positionOffset: { // 裁剪框屏幕偏移
      type: Object,
      default: () => {
        return {
          top: 0,
          left: 0
        }
      }
    },
    borderWidth: { // 裁剪框边框宽度
      type: Number,
      default: 1
    },
    borderColor: { // 裁剪框边框颜色
      type: String,
      default: '#ffffff'
    },
    boldCornerLen: { // 裁剪框边角加粗长度
      type: Number,
      default: 24
    },
    coverColor: { // 遮罩背景颜色
      type: String,
      default: 'rgba(0,0,0,.3)'
    },
    cropSizePercent: { // 裁剪框占裁剪显示区域的比例
      type: Number,
      default: 0.9
    },
    rotateSlider: { // 是否开启旋转刻度盘
      type: Boolean,
      default: true
    },
    startAngle: { // 旋转刻度盘开始角度
      type: Number,
      default: -90
    },
    endAngle: { // 旋转刻度盘结束角度
      type: Number,
      default: 90
    },
    gapAngle: { // 旋转刻度盘间隔角度
      type: Number,
      default: 10
    },
    lineationItemWidth: { // 旋转刻度盘间隔宽度，最小为40.5
      type: Number,
      default: 40.5
    },
    funcBtns: { // 功能按钮
      type: Object,
      default: () => {
        return {
          close: true,
          crop: true,
          around: true,
          reset: true
        }
      }
    }
  },
  computed: {
    // 开始角度需要小于0，结束角度需要大于0，且开始角度和结束角度之间存在大于0的整数个间隔
    startAngleCopy () {
      const startAngle = this.startAngle < 0 ? parseInt(this.startAngle) : 0
      return startAngle
    },
    endAngleCopy () {
      const startAngle = this.startAngle < 0 ? parseInt(this.startAngle) : 0
      const gapAngle = this.gapAngle > 0 ? parseInt(this.gapAngle) : 3
      let endAngle = this.endAngle > 0 ? parseInt(this.endAngle) : 0
      if ((endAngle - startAngle) % gapAngle !== 0) {
        endAngle = Math.ceil((endAngle - startAngle) / gapAngle) * gapAngle + startAngle
      }
      return endAngle
    },
    gapAngleCopy () {
      const gapAngle = this.gapAngle > 3 ? parseInt(this.gapAngle) : 3
      return gapAngle
    },
    lineationItemWidthCopy () {
      const lineationItemWidth = this.lineationItemWidth >= 40.5 ? this.lineationItemWidth : 40.5 // 最小宽度限制
      return lineationItemWidth
    }
  },
  watch: {
    src (src) {
      if (this.isAttached) {
        this.setImage()
      }
    }
  },
  data () {
    return {
      isAttached: false,
      lineationArr: [],
      curMoveX: 0,
      cropContentStyle: '', // 裁剪图片样式
      lineationWidth: 0, // 旋转刻度盘总宽度
      visibleSrc: '',
      resultSrc: '',

      contentSize: {
        width: 0,
        height: 0
      },
      resultSize: {
        width: 0,
        height: 0
      },
      finalSize: {
        width: 0,
        height: 0
      },
      coverSize: {
        width: 0,
        height: 0
      },
      originImage: null, // 初始图片
      cropFinalC: null,
      cropFinalCtx: null,
      cropContentC: null,
      cropContentCtx: null,
      cropResultC: null,
      cropResultCtx: null,
      contentWidth: 0,
      contentHeight: 0,
      fingerCenter: {
        x: 0,
        y: 0
      }, // 双指操作中心
      fingerLen: 0, // 双指距离
      fingerScale: 1, // 双指缩放倍数
      multiPoint: false, // 是否开始多点触控
      scaleTimes: 1, // 缩放倍数
      curMoveXBefore: 0, // 旋转刻度盘位置当前偏移量
      changedX: 0, // 旋转刻度盘当前偏移量
      baseMoveX: 0, // 旋转刻度盘位置初始化偏移量
      contentCurMoveX: 0, // 图片 X 轴方向上的总位移
      contentCurMoveY: 0, // 图片 Y 轴方向上的总位移
      baseAngle: 0,
      rotateAngle: 0, // 旋转角度
      rotateScale: 1, // 旋转缩放倍数
      downPoints: [], // 操作点坐标数组
      isControl: false, // 是否正在操作
      cropMask: null,
      cropCoverC: null,
      cropCoverContext: null,
      cropRotate: null,
      maskViewSize: { // 容器屏幕尺寸
        width: 0,
        height: 0
      },
      times: 1, // 实际尺寸/显示尺寸
      cropRect: {
        width: 0,
        height: 0,
        top: 0,
        left: 0
      },
      cropPoints: [], // 裁剪框顶点坐标
      cropCenter: { // 裁剪框中心点坐标
        x: 0,
        y: 0
      },
      initPosition: '', // 裁剪图片初始定位
      initTransform: '', // 裁剪图片初始位移
      initSize: '', // 裁剪图片尺寸
      orientation: 1, // 默认方向
      initContentPoints: [], // 图片初始顶点坐标
      contentPoints: [], // 图片顶点坐标
      initScale: 1, // 初始缩放倍数
      rotateWidth: 0 // 旋转刻度盘显示宽度
    }
  },
  mounted () {
    this.initRotateSlider()
    this.initChilds()
    this.isAttached = true
  },
  methods: {
    // ----- 以下为transform()主函数及其辅助函数 ----- //
    // 旋转、缩放、移动
    transform (rotateCover, scaleKeepCover) {
      var scaleNum = this.scaleTimes / this.times * this.rotateScale
      var transform = ''
      transform += ' scale(' + scaleNum + ')' // 缩放
      transform += ' translateX(' + this.contentCurMoveX / scaleNum + 'px) translateY(' + this.contentCurMoveY / scaleNum + 'px)' // 移动
      transform += ' rotate(' + this.rotateAngle + 'deg)'

      if (scaleKeepCover) { // 缩放时为了保证裁剪框不出现空白，需要在原有变换的基础上再进行一定的位移变换
        transform = this.getCoverTransform(transform, true)
        var scMat = this.getTransformMatrix(transform)
        this.contentCurMoveX = scMat.e
        this.contentCurMoveY = scMat.f
      }

      if (rotateCover) { // 旋转时需要保证裁剪框不出现空白，需要在原有变换的基础上再进行一定的适配变换
        var rotatePoints = this.getTransformPoints('scaleY(-1)' + transform, this.initContentPoints)
        var coverScale = this.getCoverRectScale(rotatePoints, this.cropPoints)
        var changedX = this.changedX
        var curMoveX = this.curMoveXBefore
        var totalMoveX = curMoveX - changedX - this.baseMoveX
        var rotateCenter = this.getPointsCenter(rotatePoints)
        var centerVec = {
          x: rotateCenter.x - this.cropCenter.x,
          y: rotateCenter.y - this.cropCenter.y
        }
        var percent = Math.abs(changedX) / Math.abs(totalMoveX)
        if (coverScale > 1) {
          this.rotateScale = this.rotateScale * coverScale
          scaleNum = scaleNum * coverScale
        } else if (this.vecLen(centerVec) < 1 && percent > 0) { // 中心点接近重合时，旋转支持自适应缩小
          if (coverScale < (1 - percent)) { // 不能突变
            coverScale = 1 - percent
          }
          if (this.rotateScale * coverScale > 1) {
            this.rotateScale = this.rotateScale * coverScale
          } else { // 不能影响 scaleTimes
            this.rotateScale = 1
            coverScale = 1
          }
          scaleNum = scaleNum * coverScale
        }
      }

      // 操作变换
      transform = ''
      transform += ' scale(' + scaleNum + ')' // 缩放
      transform += ' translateX(' + this.contentCurMoveX / scaleNum + 'px) translateY(' + this.contentCurMoveY / scaleNum + 'px)' // 移动
      transform += ' rotate(' + this.rotateAngle + 'deg)'
      var style = this.initSize + this.initPosition + this.initTransform + transform
      this.cropContentStyle = style
      this.contentPoints = this.getTransformPoints('scaleY(-1)' + transform, this.initContentPoints)
    },

    // 获得矩形点坐标中心
    getPointsCenter (points) {
      var center = {
        x: (points[0].x + points[2].x) / 2,
        y: (points[0].y + points[2].y) / 2
      }
      return center
    },

    // 计算一个矩形刚好包含另一个矩形需要的缩放倍数
    getCoverRectScale (outer, inner) {
      var scale = 0
      for (var i = 0; i < inner.length; i++) {
        var num = this.getCoverPointScale(inner[i], outer)
        if (num > scale) {
          scale = num
        }
      }
      return scale
    },

    // 计算一个矩形刚好包含矩形外一点需要的缩放倍数
    getCoverPointScale (point, rectPoints) {
      var pcv = this.getPCVectorProjOnUpAndRight(point, rectPoints)

      // 计算矩形外一点到矩形中心向量在矩形边框向量上的投影距离
      var uLen = this.vecLen(pcv.uproj)
      var height = this.vecLen(pcv.up) / 2
      var rLen = this.vecLen(pcv.rproj)
      var width = this.vecLen(pcv.right) / 2

      // 根据投影距离计算缩放倍数
      if (uLen / height > rLen / width) {
        return 1 + (uLen - height) / height
      } else {
        return 1 + (rLen - width) / width
      }
    },

    // 计算图片内容刚好包含裁剪框的transform变换
    getCoverTransform (transform, onlyTranslate) {
      var cRect = this.getCoveRect(this.cropPoints, this.rotateAngle)
      onlyTranslate = onlyTranslate || false

      // 计算放大倍数
      var uScale = 1 // 水平缩放倍数和垂直缩放倍数
      var rScale = 1
      var cup = {
        x: this.contentPoints[1].x - this.contentPoints[2].x,
        y: this.contentPoints[1].y - this.contentPoints[2].y
      }
      var cright = {
        x: this.contentPoints[1].x - this.contentPoints[0].x,
        y: this.contentPoints[1].y - this.contentPoints[0].y
      }
      var tup = {
        x: cRect[1].x - cRect[2].x,
        y: cRect[1].y - cRect[2].y
      }
      var tright = {
        x: cRect[1].x - cRect[0].x,
        y: cRect[1].y - cRect[0].y
      }
      var uAng = this.vecAngle(cup, tup)
      if (Math.abs(180 - uAng) < Math.abs(90 - uAng) || Math.abs(0 - uAng) < Math.abs(90 - uAng)) { // 更接近180或者0
        uScale = this.vecLen(tup) / this.vecLen(cup)
        rScale = this.vecLen(tright) / this.vecLen(cright)
      } else {
        uScale = this.vecLen(tup) / this.vecLen(cright)
        rScale = this.vecLen(tright) / this.vecLen(cup)
      }
      uScale = uScale < 1 ? 1 : uScale
      rScale = rScale < 1 ? 1 : rScale

      var scale = uScale > rScale ? uScale : rScale

      if (onlyTranslate && scale > 1) {
        return transform
      }

      // 复制坐标
      var scalePoints = []
      for (var i = 0; i < this.contentPoints.length; i++) {
        scalePoints.push({
          x: this.contentPoints[i].x,
          y: this.contentPoints[i].y
        })
      }

      // 计算放大后的新坐标
      if (scale > 1) {
        transform += ' scale(' + scale + ')'
        this.rotateScale = this.rotateScale * scale
        scalePoints = this.getTransformPoints('scaleY(-1)' + transform, this.initContentPoints)
      }

      // 位移变换
      var scaleNum = this.scaleTimes / this.times * this.rotateScale
      var count = 0
      var self = this
      var outDetails = []
      do {
        // 找出裁剪框超出的顶点
        outDetails = this.getOutDetails(this.cropPoints, scalePoints)
        if (outDetails.length > 0) {
          count++
          outDetails.sort(function (a, b) { // 找出距离最远的点
            var aLen = self.vecLen(a.iv)
            var bLen = self.vecLen(b.iv)
            if (aLen < bLen) {
              return 1
            }
            if (aLen > bLen) {
              return -1
            }
            return 0
          })

          // 开始移动
          var maxFarOut = outDetails[0]
          var maxFarPcv = maxFarOut.pcv

          // 计算X轴位移
          uAng = this.vecAngle(maxFarPcv.up, maxFarPcv.uproj)
          var uLen = this.vecLen(maxFarPcv.uproj)
          var moveY = 0

          // if(uAng === 0){ //同方向
          if (Math.abs(uAng) < 90) { // 浮点数精度问题，接近0时小于90 ，接近180时大于90
            moveY = -uLen * maxFarOut.uOver
          } else {
            moveY = uLen * maxFarOut.uOver
          }
          if (moveY !== 0) {
            transform += ' translateY(' + moveY / scaleNum + 'px)'
          }

          // 计算Y轴位移
          var rAng = this.vecAngle(maxFarPcv.right, maxFarPcv.rproj)
          var rLen = this.vecLen(maxFarPcv.rproj)
          var moveX = 0

          if (Math.abs(rAng) < 90) { // 同方向
            moveX = rLen * maxFarOut.rOver
          } else {
            moveX = -rLen * maxFarOut.rOver
          }
          if (moveX !== 0) {
            transform += ' translateX(' + moveX / scaleNum + 'px)'
          }

          // 计算位移后的新坐标
          if (moveX !== 0 || moveY !== 0) {
            for (i = 0; i < scalePoints.length; i++) {
              scalePoints[i].x += maxFarOut.iv.x
              scalePoints[i].y += maxFarOut.iv.y
            }
          }
        }
      } while (count < 2 && outDetails.length > 0)

      return transform
    },

    // 计算新的变换坐标
    getTransformPoints (transform, points) {
      var matrix = this.getTransformMatrix(transform)
      var nPoints = []
      for (var i = 0; i < points.length; i++) {
        var item = {
          x: points[i].x,
          y: points[i].y
        }
        item = TransformationMatrix.applyToPoint(matrix, item)
        nPoints.push(item)
      }
      nPoints.reverse() // 顶点顺序发生了变化，需要颠倒

      return nPoints
    },

    // 获取 css transform 属性对应的矩形形式
    getTransformMatrix (transform) {
      var transforms = transform.split(' ')
      var params = []
      for (var i = 0; i < transforms.length; i++) {
        if (transforms[i].trim() !== '') { // 不能为空
          var func = this.getTransformFunctionName(transforms[i])
          var result
          if (func.name !== 'rotate') {
            result = TransformationMatrix[func.name](func.params[0], func.params[1])
          } else {
            result = TransformationMatrix[func.name](func.params[0])
          }
          params.push(result)
        }
      }

      return TransformationMatrix.compose(params)
    },

    // 根据 css transform 属性获取 transformation-matrix 对应的函数名称以及参数
    getTransformFunctionName (transform) {
      var start = transform.indexOf('(')
      var end = transform.indexOf(')')
      var func = {}

      // 参数
      var params = transform.substring(start + 1, end).split(',')
      var arr = []
      for (var i = 0; i < params.length; i++) {
        arr.push(parseFloat(params[i]))
      }
      func.params = arr

      // 名称
      var name = transform.substring(0, start).toLowerCase()
      var defParams = 0 // 默认参数
      if (name.indexOf('scale') !== -1) {
        func.name = 'scale'
        defParams = 1
      } else if (name.indexOf('translate') !== -1) {
        func.name = 'translate'
      } else if (name.indexOf('skew') !== -1) {
        func.name = 'skewDEG'
      } else if (name.indexOf('rotate') !== -1) {
        func.name = 'rotateDEG' // 角度
      }

      // 加入默认参数
      if (name.indexOf('x') !== -1) {
        func.params.push(defParams)
      } else if (name.indexOf('y') !== -1) {
        func.params.unshift(defParams)
      } else if (name.indexOf('rotate') === -1 && func.params.length <= 1) { // 除了 rotate 其它函数支持 x、y 两个参数，如果 css transform 属性参数只有一个则另一个参数也是如此。
        func.params.push(func.params[0])
      }

      return func
    },

    // 计算向量夹角
    vecAngle (vec1, vec2) {
      var acos = (vec1.x * vec2.x + vec1.y * vec2.y) / (this.vecLen(vec1) * this.vecLen(vec2))
      if (Math.abs(acos) > 1) { // 因为浮点数精度结果有可能超过1，Math.acos(1.0000001) = NaN
        acos = acos > 0 ? 1 : -1
      }
      var rad = Math.acos(acos)
      var angle = rad * 180 / Math.PI
      return angle
    },

    // 计算向量的模
    vecLen (vec) {
      return Math.sqrt(vec.x * vec.x + vec.y * vec.y)
    },

    // 找出一个矩形在另一个矩形外的顶点数据
    getOutDetails (inner, outer) {
      var outDetails = []
      for (var i = 0; i < inner.length; i++) {
        var pt = inner[i]
        if (!this.isPointInRectCheckByLen(pt, outer)) {
          var pcv = this.getPCVectorProjOnUpAndRight(pt, outer)
          var iv = {
            x: 0,
            y: 0
          }
          var uLen = this.vecLen(pcv.uproj)
          var height = this.vecLen(pcv.up) / 2
          var rLen = this.vecLen(pcv.rproj)
          var width = this.vecLen(pcv.right) / 2
          var uOver = 0
          var rOver = 0
          if (uLen > height) {
            uOver = (uLen - height) / uLen
            iv.x += pcv.uproj.x * uOver
            iv.y += pcv.uproj.y * uOver
          }
          if (rLen > width) {
            rOver = (rLen - width) / rLen
            iv.x += pcv.rproj.x * rOver
            iv.y += pcv.rproj.y * rOver
          }
          outDetails.push({
            x: pt.x,
            y: pt.y,
            iv: iv,
            uOver: uOver,
            rOver: rOver,
            pcv: pcv
          })
        }
      }
      return outDetails
    },

    // 获取刚好包含某个矩形的新矩形
    getCoveRect (rect, angle) {
      if (angle < 0) {
        angle = 90 + angle % 90
      } else {
        angle = angle % 90
      }
      var rad = angle / 180 * Math.PI

      var up = {
        x: rect[1].x - rect[2].x,
        y: rect[1].y - rect[2].y
      }
      var right = {
        x: rect[1].x - rect[0].x,
        y: rect[1].y - rect[0].y
      }
      var rLen = this.vecLen(right)
      var uLen = this.vecLen(up)

      var nRect = []
      nRect[0] = {}
      nRect[0].x = rect[0].x + rLen * Math.sin(rad) * Math.sin(rad)
      nRect[0].y = rect[0].y + rLen * Math.sin(rad) * Math.cos(rad)

      nRect[1] = {}
      nRect[1].x = rect[1].x + uLen * Math.sin(rad) * Math.cos(rad)
      nRect[1].y = rect[1].y - uLen * Math.sin(rad) * Math.sin(rad)

      nRect[2] = {}
      nRect[2].x = rect[2].x - rLen * Math.sin(rad) * Math.sin(rad)
      nRect[2].y = rect[2].y - rLen * Math.sin(rad) * Math.cos(rad)

      nRect[3] = {}
      nRect[3].x = rect[3].x - uLen * Math.sin(rad) * Math.cos(rad)
      nRect[3].y = rect[3].y + uLen * Math.sin(rad) * Math.sin(rad)

      return nRect
    },

    // 根据矩形中心到某一点向量在矩形边框向量的投影长度判断该点是否在矩形内
    isPointInRectCheckByLen (point, rectPoints) {
      var pcv = this.getPCVectorProjOnUpAndRight(point, rectPoints)

      var precision = 100 // 保留两位小数

      var uLen = Math.round(this.vecLen(pcv.uproj) * precision)
      var height = Math.round(this.vecLen(pcv.up) / 2 * precision)
      var rLen = Math.round(this.vecLen(pcv.rproj) * precision)
      var width = Math.round(this.vecLen(pcv.right) / 2 * precision)

      if (uLen <= height && rLen <= width) {
        return true
      } else {
        return false
      }
    },

    // 计算矩形中心到某点的向量在矩形自身坐标系上方向和右方向上的投影向量
    getPCVectorProjOnUpAndRight (point, rectPoints) {
      // 计算矩形自身坐标系的上方向向量和右方向向量
      var up = {
        x: rectPoints[1].x - rectPoints[2].x,
        y: rectPoints[1].y - rectPoints[2].y
      }
      var right = {
        x: rectPoints[1].x - rectPoints[0].x,
        y: rectPoints[1].y - rectPoints[0].y
      }

      // 计算矩形中心点
      var center = this.getPointsCenter(rectPoints)
      var line = {
        x: point.x - center.x,
        y: point.y - center.y
      }

      var uproj = this.getProjectionVector(line, up)
      var rproj = this.getProjectionVector(line, right)

      return {
        up: up,
        uproj: uproj,
        right: right,
        rproj: rproj
      }
    },

    // 计算向量 a 在向量 b 上的投影向量
    getProjectionVector (vecA, vecB) {
      var bLen = this.vecLen(vecB)
      var ab = vecA.x * vecB.x + vecA.y * vecB.y

      var proj = {
        x: ab / Math.pow(bLen, 2) * vecB.x,
        y: ab / Math.pow(bLen, 2) * vecB.y
      }

      return proj
    },

    // ----- 以上为transform()主函数及其辅助函数 ----- //

    // ----- 以下为初始化 ----- //
    // 初始化旋转刻度盘
    initRotateSlider () {
      // 计算刻度列表
      var lineationArr = []
      for (var i = this.startAngleCopy; i <= this.endAngleCopy; i += this.gapAngleCopy) {
        lineationArr.push(i)
      }
      var lineationWidth = this.lineationItemWidthCopy * ((this.endAngleCopy - this.startAngleCopy) / this.gapAngleCopy + 1)

      var self = this
      this.cropRotate = uni.createSelectorQuery().select('#' + S_ID + ' .crop-rotate')
      this.cropRotate.boundingClientRect(function (rect) {
        self.rotateWidth = rect.width
        self.baseMoveX = -(lineationWidth * (0 - self.startAngleCopy + self.gapAngleCopy / 2) / (self.endAngleCopy - self.startAngleCopy + self.gapAngleCopy) - self.rotateWidth / 2) // 开始角度大于 0 且结束角度小于 0，以 0 度为起点
        var angle = self.rotateAngle - self.baseAngle
        self.curMoveXBefore = angle * lineationWidth / (self.endAngleCopy - self.startAngleCopy + self.gapAngleCopy) + self.baseMoveX
        // 超出滚动边界
        if (self.curMoveXBefore > 0 || self.curMoveXBefore < self.rotateWidth - lineationWidth) {
          self.rotateAngle = self.baseAngle
          self.curMoveXBefore = self.baseMoveX
          self.changedX = 0
          self.rotateScale = 1
          self.startControl()
          self.transform(true)
          self.endControl()
        }
        self.curMoveX = -self.curMoveXBefore
        self.lineationArr = lineationArr
        self.lineationWidth = lineationWidth
      }).exec()
    },

    // 初始化相关子元素
    initChilds () {
      var self = this
      this.initPosition = 'position:absolute; left:50%; top:50%;'
      this.initTransform = 'transform:translate3d(-50%,-50%,0)'

      // #ifdef MP-WEIXIN || MP-QQ
      var callCount = 0 // 回调计数器
      var totalCount = 0
      var callback = function () {
        if (callCount >= totalCount) {
          self.cropCoverC.width = self.maskViewSize.width * SystemInfo.pixelRatio
          self.cropCoverC.height = self.maskViewSize.height * SystemInfo.pixelRatio
          self.updateFrame()
        }
      }

      this.cropMask = this.createSelectorQuery().select('#' + S_ID + ' .crop-mask')
      totalCount++
      this.cropMask.boundingClientRect(function (rect) {
        self.maskViewSize = {
          width: rect.width,
          height: rect.height
        }
        callCount++
        callback()
      }).exec()

      this.cropContentC = this.createSelectorQuery().select('#' + S_ID + ' .crop-content')
      totalCount++
      this.cropContentC.node().exec(function (res) {
        self.cropContentC = res[0].node
        self.cropContentCtx = self.cropContentC.getContext('2d')
        callCount++
        callback()
      })

      this.cropFinalC = this.createSelectorQuery().select('#' + S_ID + ' .crop-final')
      totalCount++
      this.cropFinalC.node().exec(function (res) {
        self.cropFinalC = res[0].node
        self.cropFinalCtx = self.cropFinalC.getContext('2d')
        callCount++
        callback()
      })

      this.cropResultC = this.createSelectorQuery().select('#' + S_ID + ' .crop-result')
      totalCount++
      this.cropResultC.node().exec(function (res) {
        self.cropResultC = res[0].node
        self.cropResultCtx = self.cropResultC.getContext('2d')
        callCount++
        callback()
      })

      this.cropCoverC = this.createSelectorQuery().select('#' + S_ID + ' .crop-cover')
      totalCount++
      this.cropCoverC.node().exec(function (res) {
        self.cropCoverC = res[0].node
        self.cropCoverContext = self.cropCoverC.getContext('2d')
        callCount++
        callback()
      })
      // #endif
      // #ifdef H5
      this.cropMask = document.querySelector('#' + S_ID + ' .crop-mask')

      this.cropContentC = document.querySelector('#' + S_ID + ' .crop-content > canvas')
      this.cropContentCtx = this.cropContentC.getContext('2d')

      this.cropFinalC = document.querySelector('#' + S_ID + ' .crop-final > canvas')
      this.cropFinalCtx = this.cropFinalC.getContext('2d')

      this.cropResultC = document.querySelector('#' + S_ID + ' .crop-result > canvas')
      this.cropResultCtx = this.cropResultC.getContext('2d')

      this.cropCoverC = document.querySelector('#' + S_ID + ' .crop-cover > canvas')
      this.cropCoverContext = this.cropCoverC.getContext('2d')

      this.$nextTick(() => {
        const rect = this.cropMask.getBoundingClientRect()
        this.maskViewSize = {
          width: rect.width,
          height: rect.height
        }
        this.coverSize = {
          width: this.maskViewSize.width + 'px',
          height: this.maskViewSize.height + 'px'
        }
        // canvas尺寸变化，需延迟再画边框，否则H5不显示
        setTimeout(() => {
          this.updateFrame()
        }, 100)
      })
      // #endif
    },

    // 根据裁剪图片目标尺寸、裁剪框显示比例、裁剪框偏移等参数更新并重现绘制裁剪框
    updateFrame () {
      var src = this.src
      var size = this.size
      var cropSizePercent = this.cropSizePercent
      var positionOffset = this.positionOffset

      this.times = (size.width / this.maskViewSize.width > size.height / this.maskViewSize.height) ? size.width / this.maskViewSize.width / cropSizePercent : size.height / this.maskViewSize.height / cropSizePercent
      this.cropRect = {
        width: size.width / this.times,
        height: size.height / this.times
      }
      this.cropRect.left = (this.maskViewSize.width - this.cropRect.width) / 2 - positionOffset.left
      this.cropRect.top = (this.maskViewSize.height - this.cropRect.height) / 2 - positionOffset.top
      this.cropPoints = this.rectToPoints(this.cropRect)
      this.cropCenter = this.getPointsCenter(this.cropPoints)
      this.defaultBorderDraw()

      this.setImage(src)
    },

    // 矩形位置形式转换为顶点坐标形式
    rectToPoints (rect) {
      var points = []
      points.push({
        x: -(this.maskViewSize.width / 2 - rect.left),
        y: this.maskViewSize.height / 2 - rect.top
      })
      points.push({
        x: points[0].x + rect.width,
        y: points[0].y
      })
      points.push({
        x: points[1].x,
        y: points[1].y - rect.height
      })
      points.push({
        x: points[0].x,
        y: points[2].y
      })

      return points
    },

    // 默认绘制裁剪框
    defaultBorderDraw () {
      var coverColor = this.coverColor
      var borderColor = this.borderColor
      var boldCornerLen = this.boldCornerLen
      var borderWidth = this.borderWidth
      boldCornerLen = boldCornerLen >= borderWidth * 2 ? boldCornerLen : borderWidth * 2
      let coverWidth
      let coverHeight
      let borderRect

      // #ifndef H5
      coverWidth = this.cropCoverC.width
      coverHeight = this.cropCoverC.height
      // #endif
      // #ifdef H5
      coverWidth = this.maskViewSize.width
      coverHeight = this.maskViewSize.height
      // #endif
      this.cropCoverContext.clearRect(0, 0, coverWidth, coverHeight)
      this.cropCoverContext.fillStyle = coverColor
      this.cropCoverContext.fillRect(0, 0, coverWidth, coverHeight)

      // 绘制边框（边框内嵌）
      // #ifndef H5
      borderRect = {
        left: this.cropRect.left * SystemInfo.pixelRatio,
        top: this.cropRect.top * SystemInfo.pixelRatio,
        width: this.cropRect.width * SystemInfo.pixelRatio,
        height: this.cropRect.height * SystemInfo.pixelRatio
      }
      // #endif
      // #ifdef H5
      borderRect = this.cropRect
      // #endif
      this.cropCoverContext.fillStyle = borderColor
      this.cropCoverContext.fillRect(borderRect.left, borderRect.top, borderRect.width, borderRect.height)

      if (boldCornerLen > 0) {
        // 边框四个角加粗
        this.cropCoverContext.fillRect(borderRect.left - borderWidth, borderRect.top - borderWidth, boldCornerLen, boldCornerLen) // 左上角
        this.cropCoverContext.fillRect(borderRect.left + borderRect.width - boldCornerLen + borderWidth, borderRect.top - borderWidth, boldCornerLen, boldCornerLen) // 右上角
        this.cropCoverContext.fillRect(borderRect.left - borderWidth, borderRect.top + borderRect.height - boldCornerLen + borderWidth, boldCornerLen, boldCornerLen) // 左下角
        this.cropCoverContext.fillRect(borderRect.left + borderRect.width - boldCornerLen + borderWidth, borderRect.top + borderRect.height - boldCornerLen + borderWidth, boldCornerLen, boldCornerLen) // 右下角
      }

      // 清空内容区域
      this.cropCoverContext.clearRect(borderRect.left + borderWidth, borderRect.top + borderWidth, borderRect.width - 2 * borderWidth, borderRect.height - 2 * borderWidth)
    },

    // 设置裁剪图片
    setImage () {
      var src = this.src
      if (src !== null && src !== '') {
        var type = Object.prototype.toString.call(src)
        if (type === '[object String]') { // 字符串
          this.load()
        }
      }
    },

    // 加载图片
    load () {
      var self = this
      var src = this.src
      uni.showLoading({
        title: '图片准备中...',
        mask: true
      })
      uni.getImageInfo({
        src: src,
        success (res) {
          self.originImage = res
          let image
          // #ifdef MP-WEIXIN || MP-QQ
          self.orientation = self.orientationToNumber(res.orientation)
          image = self.cropContentC.createImage()
          // #endif
          // #ifdef H5
          // TODO 获取图片初始方向，赋值给 orientation
          image = new Image()
          // #endif
          image.src = src
          image.onload = function () {
            self.transformCoordinates(image)
            self.init()
          }
        }
      })
    },

    // #ifdef MP-WEIXIN
    // 图片方向转换数字表示
    orientationToNumber (name) {
      var num = 1 // 默认方向
      switch (name) {
        case 'up-mirrored':
          num = 2
          break
        case 'down':
          num = 3
          break
        case 'down-mirrored':
          num = 4
          break
        case 'left-mirrored':
          num = 5
          break
        case 'right':
          num = 6
          break
        case 'right-mirrored':
          num = 7
          break
        case 'left':
          num = 8
          break
        case 'up':
        default:
          num = 1
          break
      }
      return num
    },
    // #endif

    // 处理图片方向
    transformCoordinates (image) {
      this.contentWidth = this.originImage.width
      this.contentHeight = this.originImage.height
      // 图片方向大于 4 时宽高互相
      if (this.orientation > 4) {
        this.contentWidth = this.originImage.height
        this.contentHeight = this.originImage.width
      }
      this.initSize = 'width:' + this.contentWidth + 'px;height:' + this.contentHeight + 'px;'
      // #ifndef H5
      this.cropContentC.width = this.contentWidth
      this.cropContentC.height = this.contentHeight
      this.cropResultC.width = this.contentWidth
      this.cropResultC.height = this.contentHeight
      this.cropFinalC.width = this.size.width
      this.cropFinalC.height = this.size.height
      // #endif
      // #ifdef H5
      this.contentSize = {
        width: this.contentWidth + 'px',
        height: this.contentHeight + 'px'
      }
      this.resultSize = {
        width: this.contentWidth + 'px',
        height: this.contentHeight + 'px'
      }
      this.finalSize = {
        width: this.size.width + 'px',
        height: this.size.height + 'px'
      }
      // #endif

      var width = this.originImage.width
      var height = this.originImage.height
      // H5端：因canvas尺寸改变，需延迟再进行绘图，否则绘制不出来
      setTimeout(() => {
        var imageCtx = this.cropContentCtx
        imageCtx.clearRect(0, 0, width, height)
        imageCtx.save()

        switch (this.orientation) {
          case 2:
            // horizontal flip
            imageCtx.translate(width, 0)
            imageCtx.scale(-1, 1)
            break
          case 3:
            // 180° rotate left
            imageCtx.translate(width, height)
            imageCtx.rotate(Math.PI)
            break
          case 4:
            // vertical flip
            imageCtx.translate(0, height)
            imageCtx.scale(1, -1)
            break
          case 5:
            // vertical flip + 90 rotate right
            imageCtx.rotate(0.5 * Math.PI)
            imageCtx.scale(1, -1)
            break
          case 6:
            // 90° rotate right
            imageCtx.rotate(0.5 * Math.PI)
            imageCtx.translate(0, -height)
            break
          case 7:
            // horizontal flip + 90 rotate right
            imageCtx.rotate(0.5 * Math.PI)
            imageCtx.translate(width, -height)
            imageCtx.scale(-1, 1)
            break
          case 8:
            // 90° rotate left
            imageCtx.rotate(-0.5 * Math.PI)
            imageCtx.translate(-width, 0)
            break
          default: break
        }
        imageCtx.drawImage(image, 0, 0, width, height)
        imageCtx.restore()

        // canvas 不受 css transform 影响 需要转换为 image 显示
        var self = this
        // #ifndef H5
        uni.canvasToTempFilePath({
          canvasId: 'crop_content',
          success: res => {
            self.visibleSrc = res.tempFilePath
            uni.hideLoading()
          }
        }, self)
        // #endif
        // #ifdef H5
        this.cropContentC.toBlob((blob) => {
          self.visibleSrc = self.getObjectURL(blob)
          uni.hideLoading()
        }, 'image/png', 1)
        // #endif
      }, 100)
    },
    // #ifdef H5
    getObjectURL (file) {
      let url = null
      if (window.createObjectURL !== undefined) { // basic
        url = window.createObjectURL(file)
      } else if (window.URL !== undefined) { // mozilla(firefox)
        url = window.URL.createObjectURL(file)
      } else if (window.webkitURL !== undefined) { // webkit or chrome
        url = window.webkitURL.createObjectURL(file)
      }
      return url
    },
    // #endif

    // 初始化
    init () {
      var width = this.contentWidth / 2
      var height = this.contentHeight / 2
      this.initContentPoints = [{
        x: -width,
        y: height
      }, {
        x: width,
        y: height
      }, {
        x: width,
        y: -height
      }, {
        x: -width,
        y: -height
      }]
      this.contentPoints = this.initContentPoints.slice()

      // 计算初始缩放倍数
      var size = this.size
      if (size.width / size.height > this.contentWidth / this.contentHeight) {
        this.initScale = size.width / this.contentWidth
      } else {
        this.initScale = size.height / this.contentHeight
      }

      this.reset()
    },
    // ----- 以上为初始化 ----- //

    // ----- 以下为操作响应函数 ----- //
    // 操作开始
    startControl (touches) {
      touches = touches || []
      if (!this.isControl || this.isTwoFingerEvent(touches)) {
        this.isControl = true
        this.downPoints = touches
      }
    },

    // 双指操作事件
    isTwoFingerEvent (touches) {
      /**
       * 微信小程序双指操作时，会触发两次 touchstart 事件且前后两次事件触摸点坐标有一个坐标相同
       */
      if (this.isControl && this.downPoints && this.downPoints.length === 1 && touches.length >= 2 &&
        ((touches[0].clientX === this.downPoints[0].clientX && touches[0].clientY === this.downPoints[0].clientY) || (touches[1].clientX === this.downPoints[0].clientX && touches[1].clientY === this.downPoints[0].clientY))) {
        return true
      }
      return false
    },

    // 操作结束
    endControl () {
      if (this.isControl) {
        this.isControl = false
        this.downPoints = []
        this.scaleDownX = 0

        if (!this.isWholeCover(this.contentPoints, this.cropPoints)) { // 如果没有完全包含则需要进行适配变换
          var scaleNum = this.scaleTimes / this.times * this.rotateScale
          var transform = ''
          transform += ' scale(' + scaleNum + ')' // 缩放
          transform += ' translateX(' + this.contentCurMoveX / scaleNum + 'px) translateY(' + this.contentCurMoveY / scaleNum + 'px)' // 移动
          transform += ' rotate(' + this.rotateAngle + 'deg) '

          // 适配变换
          var coverTr = this.getCoverTransform(transform)
          var coverMat = this.getTransformMatrix(coverTr)
          this.contentCurMoveX = coverMat.e
          this.contentCurMoveY = coverMat.f
          this.contentPoints = this.getTransformPoints('scaleY(-1)' + coverTr, this.initContentPoints)

          var style = this.initSize + this.initPosition + this.initTransform + coverTr
          this.cropContentStyle = style
        }
      }
    },

    // 判断 矩形A 是否完全包含 矩形B
    isWholeCover (rectA, rectB) {
      for (var i = 0; i < rectB.length; i++) {
        if (!this.isPointInRectCheckByLen(rectB[i], rectA)) {
          return false
        }
      }
      return true
    },

    // 触摸开始
    touchstart (event) {
      this.startControl(event.touches)
      this.multiPoint = false
      if (this.downPoints && this.downPoints.length >= 2) {
        this.multiPoint = true
        var center = {
          clientX: (this.downPoints[0].clientX + this.downPoints[1].clientX) / 2,
          clientY: (this.downPoints[0].clientY + this.downPoints[1].clientY) / 2
        }
        this.fingerLen = Math.sqrt(Math.pow(this.downPoints[0].clientX - this.downPoints[1].clientX, 2) + Math.pow(this.downPoints[0].clientY - this.downPoints[1].clientY, 2))
        this.fingerScale = 1
        this.fingerCenter = { // 双指操作中心
          x: center.clientX - this.maskViewSize.width / 2,
          y: this.maskViewSize.height / 2 - center.clientY
        }
      }
    },

    // 触摸移动
    touchmove (event) {
      if (this.downPoints && this.downPoints.length > 0) {
        if (!this.multiPoint) { // 单指移动
          this.contentMove(event.touches)
        } else { // 双指缩放
          var touches = event.touches
          var newFingerLen = Math.sqrt(Math.pow(touches[0].clientX - touches[1].clientX, 2) + Math.pow(touches[0].clientY - touches[1].clientY, 2))
          var newScale = newFingerLen / this.fingerLen
          this.scaleTimes = this.scaleTimes / this.fingerScale * newScale
          var translate = this.getFingerScaleTranslate(newScale / this.fingerScale)
          this.contentCurMoveX -= translate.translateX
          this.contentCurMoveY += translate.translateY
          this.fingerScale = newScale
          this.transform(false, true)
        }
      }
    },

    // 裁剪图片移动
    contentMove (touches) {
      var point = touches[0]
      var moveX = point.clientX - this.downPoints[0].clientX
      var moveY = point.clientY - this.downPoints[0].clientY

      this.contentCurMoveX += moveX
      this.contentCurMoveY += moveY
      this.downPoints = touches

      this.transform()
    },

    // 双指缩放优化为以双指中心为基础点，实际变换以中心点为基准点，因此需要计算两者的偏移
    getFingerScaleTranslate (scale) {
      var fingerPoints = [] // 以双指中心缩放的新坐标
      var center = this.getPointsCenter(this.contentPoints) // 中心点不变
      for (var i = 0; i < this.contentPoints.length; i++) {
        var point = this.contentPoints[i]
        fingerPoints.push({
          x: point.x * scale - this.fingerCenter.x * (scale - 1),
          y: point.y * scale - this.fingerCenter.y * (scale - 1)
        })
      }
      var newCenter = this.getPointsCenter(fingerPoints)
      return {
        translateX: center.x - newCenter.x,
        translateY: center.y - newCenter.y
      }
    },

    // 滑动旋转刻度盘
    scrollLineation (event) {
      var src = this.src
      var lineationWidth = this.lineationWidth
      var scrollLeft = event.detail.scrollLeft

      this.curMoveX = scrollLeft
      this.startControl()
      var curMoveX = -scrollLeft
      var angle = (curMoveX - this.baseMoveX) / lineationWidth * (this.endAngleCopy - this.startAngleCopy + this.gapAngleCopy)
      this.changedX = curMoveX - this.curMoveXBefore
      this.curMoveXBefore = curMoveX
      this.rotateAngle = this.baseAngle + angle
      if (src.trim() !== '') {
        this.transform(true)
      }
      this.endControl()
    },

    // 整角旋转 90 度
    around () {
      var rotateSlider = this.rotateSlider

      this.startControl()
      this.rotateAngle = this.baseAngle - 90
      this.baseAngle = this.rotateAngle
      if (rotateSlider) {
        this.curMoveXBefore = this.baseMoveX
        this.curMoveX = -this.baseMoveX
      }
      this.transform()
      this.endControl()
    },

    // 重置
    reset () {
      var positionOffset = this.positionOffset
      var rotateSlider = this.rotateSlider

      this.startControl()
      this.rotateScale = 1
      this.baseAngle = 0
      this.rotateAngle = 0
      this.contentCurMoveX = -positionOffset.left
      this.contentCurMoveY = -positionOffset.top

      if (rotateSlider) {
        this.curMoveXBefore = this.baseMoveX
        this.curMoveX = -this.baseMoveX
      }
      this.scaleTimes = this.initScale
      this.transform()
      this.endControl()
    },

    // 关闭裁剪组件
    close () {
      this.$emit('on-close')
    },

    // 获取裁剪图片
    getCropImage () {
      var positionOffset = this.positionOffset
      var size = this.size
      var self = this
      var contentWidth = this.contentWidth
      var contentHeight = this.contentHeight
      var center = {
        x: contentWidth / 2,
        y: contentHeight / 2
      }
      let cropWidth = size.width
      let cropHeight = size.height
      let image1
      let image2
      // #ifdef H5
      image1 = new Image()
      image1.src = this.originImage.path // uni中H5端canvas的实现问题，本身被放大了pixelRatio倍，visibleSrc已不是原图大小
      uni.showLoading({
        title: '正在裁剪...',
        mask: true
      })
      image1.onload = function () {
        var scaleNum = self.scaleTimes / self.times * self.rotateScale
        self.cropResultCtx.clearRect(0, 0, contentWidth, contentHeight)
        self.cropResultCtx.save()
        // 设置变换中心点
        self.cropResultCtx.translate(center.x, center.y)
        // 与裁剪时显示一样，做变换，与transform()中变换一致
        self.cropResultCtx.scale(scaleNum, scaleNum)
        self.cropResultCtx.translate((self.contentCurMoveX + positionOffset.left) / scaleNum, (self.contentCurMoveY + positionOffset.top) / scaleNum)
        self.cropResultCtx.rotate(self.rotateAngle / 180 * Math.PI)
        // 图片恢复原大小
        self.cropResultCtx.scale(self.times / self.scaleTimes, self.times / self.scaleTimes)
        // 恢复中心点
        self.cropResultCtx.translate(-center.x, -center.y)
        // 在变换后的canvas中绘制图片
        self.cropResultCtx.drawImage(image1, 0, 0, contentWidth, contentHeight)
        self.cropResultCtx.restore()

        self.cropResultC.toBlob((blob1) => {
          image2 = new Image()
          const transformSrc = self.getObjectURL(blob1)
          image2.src = transformSrc
          cropWidth = Math.round(size.width / self.initScale * SystemInfo.pixelRatio)
          cropHeight = Math.round(size.height / self.initScale * SystemInfo.pixelRatio)
          const image2Width = Math.round(self.originImage.width * SystemInfo.pixelRatio)
          const image2Height = Math.round(self.originImage.height * SystemInfo.pixelRatio)
          const dx = (image2Width - cropWidth) / 2
          const dy = (image2Height - cropHeight) / 2
          image2.onload = function () {
            self.cropFinalCtx.clearRect(0, 0, size.width, size.height)
            self.cropFinalCtx.drawImage(image2, dx, dy, cropWidth, cropHeight, 0, 0, size.width, size.height)
            self.cropFinalC.toBlob((blob2) => {
              uni.hideLoading()
              const resultSrc = self.getObjectURL(blob2)
              self.resultSrc = resultSrc
              // 获取裁剪后的图片
              self.$emit('on-crop-change', {
                resultSrc: resultSrc,
                transformSrc: transformSrc
              })
            }, 'image/png', 1)
          }
        }, 'image/png', 1)
      }
      // #endif

      // #ifndef H5
      image1 = this.cropResultC.createImage()
      image1.src = this.visibleSrc
      uni.showLoading({
        title: '正在裁剪...',
        mask: true
      })
      image1.onload = function () {
        var scaleNum = self.scaleTimes / self.times * self.rotateScale
        self.cropResultCtx.clearRect(0, 0, contentWidth, contentHeight)
        self.cropResultCtx.save()
        // 设置变换中心点
        self.cropResultCtx.translate(center.x, center.y)
        // 与裁剪时显示一样，做变换，与transform()中变换一致
        self.cropResultCtx.scale(scaleNum, scaleNum)
        self.cropResultCtx.translate((self.contentCurMoveX + positionOffset.left) / scaleNum, (self.contentCurMoveY + positionOffset.top) / scaleNum)
        self.cropResultCtx.rotate(self.rotateAngle / 180 * Math.PI)
        // 图片恢复原大小
        self.cropResultCtx.scale(self.times / self.scaleTimes, self.times / self.scaleTimes)
        // 恢复中心点
        self.cropResultCtx.translate(-center.x, -center.y)
        // 在变换后的canvas中绘制图片
        self.cropResultCtx.drawImage(image1, 0, 0, contentWidth, contentHeight)
        self.cropResultCtx.restore()

        // 在变换后的图片中裁剪目标区域
        uni.canvasToTempFilePath({
          canvasId: 'crop_result'
        }, self).then(([error, res1]) => {
          image2 = self.cropFinalC.createImage()
          image2.src = res1.tempFilePath
          const dx = (image2.width - cropWidth) / 2
          const dy = (image2.height - cropHeight) / 2
          image2.onload = function () {
            self.cropFinalCtx.clearRect(0, 0, size.width, size.height)
            self.cropFinalCtx.drawImage(image2, dx, dy, cropWidth, cropHeight, 0, 0, size.width, size.height)
            uni.canvasToTempFilePath({
              canvasId: 'crop_final'
            }, self).then(([error, res2]) => {
              uni.hideLoading()
              self.resultSrc = res2.tempFilePath
              // 获取裁剪后的图片
              self.$emit('on-crop-change', {
                resultSrc: res2.tempFilePath,
                transformSrc: res1.tempFilePath
              })
            })
          }
        })
      }
      // #endif
    }
    // ----- 以上为操作响应函数 ----- //
  }
}
</script>

<style scoped>
@font-face {
    font-family: DINCondensed-Bold;
    src: url(data:application/x-font-ttf;base64,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ISg3ExMcDg8bEREs0BUdHRWMFR0dFQAAAAIAIgAAAVICzgAnADUAADcTJw4BIyImJy4BJy4BNTQ2Nz4BNz4BMzIWFx4BFx4BFRQGBw4BBwsBFBYzMjY9ATQmIyIGFUd0AgUVERsuDQcIAgMCAgMCCQcUQyoqQhQHCgMCAgICAwcFhjEeFBQeHhQUHgABKwIEBRoUChcSEjcqIy0QDxYMISQlIAwWDxAtIyErDxAZDv6aAbEXHBwXhBccHBcAAQAAAAEBBkfZJz9fDzz1AAkD6AAAAAB8JYZQAAAAANl6IicAAP/6AfQCzgABAAkAAgAAAAAAAAABAAACyP7gAMgB9AAAAAAB9AABAAAAAAAAAAAAAAAAAAAAAwH0AAABhQAsAXQAIgA1ACIAIgAJACIAIgAiACIAIgAAAAAAJgAyAG4AgAC8AR4BOAF4AcwB4AJgArIAAAABAAAADABYAAUAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAEgDeAAEAAAAAAAAATAAAAAEAAAAAAAEADQBMAAEAAAAAAAIABABZAAEAAAAAAAMAKABdAAEAAAAAAAQAEgCFAAEAAAAAAAUACACXAAEAAAAAAAYAEQCfAAEAAAAAAAcACgCwAAEAAAAAAAkADgC6AAMAAQQJAAAAlgDIAAMAAQQJAAEAGgFeAAMAAQQJAAIACAF4AAMAAQQJAAMAUAGAAAMAAQQJAAQAJAHQAAMAAQQJAAUAEAH0AAMAAQQJAAYAIgIEAAMAAQQJAAcAFAImAAMAAQQJAAkAHAI6Q29weXJpZ2h0IMKpIDE5ODEsIDIwMDIgSGVpZGVsYmVyZ2VyIERydWNrbWFzY2hpbmVuIEFHLiBBbGwgcmlnaHRzIHJlc2VydmVkLkRJTiBDb25kZW5zZWRCb2xkRElOIENvbmRlbnNlZCBCb2xkOyAxMy4yZDJlMTsgMjAxOC0wMS0yMkRJTiBDb25kZW5zZWQgQm9sZDEzLjJkMmUxRElOQ29uZGVuc2VkLUJvbGRESU5TY2hyaWZ0TGlub3R5cGUgU3RhZmYAQwBvAHAAeQByAGkAZwBoAHQAIACpACAAMQA5ADgAMQAsACAAMgAwADAAMgAgAEgAZQBpAGQAZQBsAGIAZQByAGcAZQByACAARAByAHUAYwBrAG0AYQBzAGMAaABpAG4AZQBuACAAQQBHAC4AIABBAGwAbAAgAHIAaQBnAGgAdABzACAAcgBlAHMAZQByAHYAZQBkAC4ARABJAE4AIABDAG8AbgBkAGUAbgBzAGUAZABCAG8AbABkAEQASQBOACAAQwBvAG4AZABlAG4AcwBlAGQAIABCAG8AbABkADsAIAAxADMALgAyAGQAMgBlADEAOwAgADIAMAAxADgALQAwADEALQAyADIARABJAE4AIABDAG8AbgBkAGUAbgBzAGUAZAAgAEIAbwBsAGQAMQAzAC4AMgBkADIAZQAxAEQASQBOAEMAbwBuAGQAZQBuAHMAZQBkAC0AQgBvAGwAZABEAEkATgBTAGMAaAByAGkAZgB0AEwAaQBuAG8AdAB5AHAAZQAgAFMAdABhAGYAZgACAAAAAAAA/5wAMgAAAAAAAAAAAAAAAAAAAAAAAAAMAAwAAAAQABMAFAAVABYAFwAYABkAGgAbABwAAA==);
}

.crop-whole-cover {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #5c5c5c;
}

.crop-component {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    margin: auto;
}

.crop-component .crop-mask {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.crop-component .crop-final,
.crop-component .crop-result,
.crop-component .crop-content{
  position: absolute !important;
  top:-100%;
  left:-100%;
  visibility: hidden;
}

.crop-component .crop-cover {
    position: absolute !important;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
}

/* 旋转 */
.crop-component .crop-rotate {
    width: 92%;
    height: 66px;
    position: absolute;
    bottom: 68px;
    left: 0;
    right: 0;
    margin: auto;
    overflow: hidden;
    -webkit-mask-image: linear-gradient(90deg, rgba(255, 255, 255, 0.00) 0%, rgba(255, 255, 255, 0.64) 50%, rgba(255, 255, 255, 0.00) 100%);
    mask-image: linear-gradient(90deg, rgba(255, 255, 255, 0.00) 0%, rgba(255, 255, 255, 0.64) 50%, rgba(255, 255, 255, 0.00) 100%);
}

.crop-component .crop-rotate .current {
    margin: auto;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 9px solid #D8D8D8;
    border-radius: 1px;
    box-sizing: content-box;
}

.crop-component .crop-rotate .lineation {
    height: 50px;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    font-size: 0;
    margin: 0;
    padding: 0 0 8px 0;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -khtml-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
}

.crop-component .crop-rotate .lineation>view {
    flex: 1;
    height: 100%;
    display: inline-block;
}

.crop-component .crop-rotate .lineation .number {
    width: 100%;
    height: 32px;
    font-size: 16px;
    line-height: 36px;
    text-align: center;
    font-family: DINCondensed-Bold;
    overflow: hidden;
    color: #fff;
}

.crop-component .crop-rotate .lineation .bg {
    width: 100%;
    height: 18px;
    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFEAAAAkCAQAAABbaR7PAAAA3ElEQVR42u2YMQ6DMAxFfSOuVRjKWSBsyRT3nq9zFxvJpEQoGbEUvTzs6CsiFy4mdnYm6Xexoyhbz4iViqJ9IypKHRYvsDgQ+0dkZjHrK2sM0d5BhMUmEA4Os54pDuLHnmgK2SFINmJyEXPQYrEO6Us6YzGKmKMWPcTi/ujmFpN9BtdibW/xH72Y2/Ziub8XU/jSiVtMLS2qn3Tut1jbW7xiXB5gsfQ/0eGru/uJfgRi+6s7nHRGXhx5ceTFkRdHXnxUXtyoKHtbizOz89zxNqonHpLtHURYeP1++QJbckm6SmQBuQAAAABJRU5ErkJggg==);
    background-size: 100% 100%;
    background-repeat: no-repeat;
}

/* 功能按钮 */
.crop-component .crop-btns {
    position: absolute;
    bottom: 16px;
    width: 100%;
    height: 24px;
    display: flex;
    justify-content: flex-start;
    align-items: center;
}

.crop-component .crop-btns>view {
    flex: 1;
    height: 100%;
    background-color: transparent;
    border: none;
    padding: 0;
    display: inline-block;
    margin: auto;
    position: relative;
}

.crop-component .crop-btns>view:after {
    position: absolute;
    top: 0;
    bottom: 0;
    left:0;
    right:0;
    margin: auto;
    content: '';
    display: inline-block;
}

.crop-component .crop-close:after {
    width: 18px;
    height: 18px;
    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAQAAABLCVATAAAArElEQVR42q2WWw6AIAwEuQ/eh+t4cMkajCERH7R1+ifZnSCUtikdoawUi4tTqzaVCEpFm1Z1TIsA6sC0aCjl88ON6pjmzOOCGfXo8qNeHT7Up9qOmiptKJNqLjLv+1voOsl3sftunw2hbLubYkl7N0YxA6qqhjED6g/mRNWOqWEMBoJ+DTps6PqhhISeCPRooTICFTao1ELFH2pHUIOEWrYWbohgxhpw0GJGvx1lZkUZoxUOQQAAAABJRU5ErkJggg==);
    background-size: 100% 100%;
}

.crop-component .crop-btn:after {
    right: 16px;
    width: 21px;
    height: 15px;
    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACoAAAAeCAYAAABaKIzgAAAAgklEQVR4AezOAQaEMQwF4d4nB+p1evBlFn4KFBheyAOCjG+lDqiVPmADP+DkI+9OByTfXR2QuwtykIMc5CCB6oA89zEb+Q4EIOsdcpBC0Ec6YaHlY4WGhxWQAlZAClgBKWAFpIcVkA5WQDpYASlgBaSCjUb+h+TYACB+DMUBSFKjAAABevZOv672hAAAAABJRU5ErkJggg==);
    background-size: 100% 100%;
}

.crop-component .crop-reset:after {
    width: 22px;
    height: 19px;
    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAmCAQAAAAVFrHsAAAB3klEQVR42u3XPUhVUQAH8OuzngaF1pAFVkQJElFEoPaxRELY0uAQVLS5REM0JCQYpNELiqitpoaGdKjN0cCKIFoSxOGRROJTEBoqkj6ev/B0faJpXOk9IvD8h3M4h/Pjcr7gRqKiJi0jJycTaTHq78ssnJnrKAY7B+fmOvwfcOZ3uOibV1y4kBW4hHCJTsUf4RrVS06rULVoUkngl96o0Wh8Xt6Hse4lLsj2JPAek7IaXAt5ZyzUV2P4m7NxJvQX2muTrfFuN5SF1gF5V1QURrpNidzWq1feYKh71S5389KG8NC4vfPgYVk9cZ5iVxK43quQmY3qkUe7rLfWz4NfaI9zLylc65Y+bDDgq9M4r8kPj+LX61OAc57FGUwKz+QU7vrimMoAR7pwVOS+bID7tMbpXC5crUlUgFc7E7bziQGRIXl504Q6vzz416mYhWfzXI9InQsqtYUFO+J48it9B1sWgdM+65L22oh1MfzYh6THrcO0YWPOaVLnsmZbbVOvRjP2uynvsMjFAG80qT/Jla7yUadyl0wtuLYnnDQi5YHrUiZ8N6FcpNWgTUm+uEE61Cmb7dPooEMha0R2hpGywLXZEc9Y9Y+fzRV4BS5RKSE8WhJ3tFi/CgtYLZES5Sdy/jxAWzo1BgAAAABJRU5ErkJggg==);
    background-size: 100% 100%;
}

.crop-component .crop-around:after {
    width: 18px;
    height: 22px;
    background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAsCAQAAACnWtJ+AAABHklEQVR42u3UsUrDQBzH8YvFrYOhvoLp0BcohA5dhIzZdexrZHMU+wrt2sG9Q9LBICg4CkV0CfQFdBP9OpikqebSS//UQfJbj3zucv/7/5WqCBaWkocBz9xIkUMu+ACQMSfckUbCjHgDIcQx12xkN+aUFYghLvmkPK8siZhwhr2d6WGSd0L8auiAK+2JfibGrX1H2oxp1a4abRyGBDxsLM052vkd0WVWoB63UQ73+vLT56Vwqpag1+iwWN+VSfc/cavdaE25Jo9UO4/o5D8YS0dNPz+TL6WyCoZSqJs3ji2lsid6rvBIjFoiwSuBgnR1qgwZgKQEGqZrkaJGSnvgO0sp1M5GnxBS+fcN9AfQL7GBGuifQaJRW4REw38P+QIQNLRX56aQYgAAAABJRU5ErkJggg==);
    background-size: 100% 100%;
}

/* iphoneX */
@media only screen and (device-width : 375px) and (device-height : 812px) and (-webkit-device-pixel-ratio : 3),
(device-width : 414px) and (device-height : 896px) {
    .crop-component .crop-btns {
        bottom: 43px;
    }

    .crop-component .crop-rotate {
        bottom: 95px;
    }
}
</style>
