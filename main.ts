// =============================================
// ST7735S + SRAM 23LC1024
// GRAPHICS SPEED DEMO
// micro:bit V2
// =============================================

let LCD_CS = DigitalPin.P16
let LCD_DC = DigitalPin.P12
let LCD_RST = DigitalPin.P8
let SRAM_CS = DigitalPin.P2

let WIDTH = 160
let HEIGHT = 128
let FRAME_BYTES = 40960
let CHUNK = 4096

let speeds = [8000000, 16000000, 32000000]
let speedIndex = 2

let mode = 0
let frameCount = 0
let fps = 0
let fpsStart = 0
let running = true

let tx = pins.createBuffer(CHUNK)
let rx = pins.createBuffer(CHUNK)
let dummy = pins.createBuffer(CHUNK)

// =============================================
// SPI
// =============================================

function setSPI() {
    pins.spiFrequency(speeds[speedIndex])
    pins.spiFormat(8, 0)
}

function deselectAll() {
    pins.digitalWritePin(LCD_CS, 1)
    pins.digitalWritePin(SRAM_CS, 1)
}

// =============================================
// LCD LOW LEVEL
// =============================================

function lcdCommand(cmd: number) {
    deselectAll()
    pins.digitalWritePin(LCD_DC, 0)
    pins.digitalWritePin(LCD_CS, 0)
    pins.spiWrite(cmd)
    pins.digitalWritePin(LCD_CS, 1)
}

function lcdData(value: number) {
    deselectAll()
    pins.digitalWritePin(LCD_DC, 1)
    pins.digitalWritePin(LCD_CS, 0)
    pins.spiWrite(value)
    pins.digitalWritePin(LCD_CS, 1)
}

function lcdInit() {
    deselectAll()

    pins.digitalWritePin(LCD_RST, 1)
    basic.pause(10)
    pins.digitalWritePin(LCD_RST, 0)
    basic.pause(20)
    pins.digitalWritePin(LCD_RST, 1)
    basic.pause(120)

    lcdCommand(0x01)
    basic.pause(150)

    lcdCommand(0x11)
    basic.pause(150)

    lcdCommand(0x3A)
    lcdData(0x05)

    lcdCommand(0x36)
    lcdData(0xA0)

    lcdCommand(0x29)
    basic.pause(100)
}

function lcdWindow(x: number, y: number, w: number, h: number) {
    lcdCommand(0x2A)
    lcdData(0)
    lcdData(x + 1)
    lcdData(0)
    lcdData(x + w)

    lcdCommand(0x2B)
    lcdData(0)
    lcdData(y + 2)
    lcdData(0)
    lcdData(y + h + 1)

    lcdCommand(0x2C)
}

function lcdWriteBuffer(data: Buffer) {
    pins.digitalWritePin(SRAM_CS, 1)
    pins.digitalWritePin(LCD_DC, 1)
    pins.digitalWritePin(LCD_CS, 0)

    pins.spiTransfer(data, null)

    pins.digitalWritePin(LCD_CS, 1)
}

// =============================================
// SRAM
// =============================================

function sramWrite(address: number, data: Buffer) {
    deselectAll()
    pins.digitalWritePin(SRAM_CS, 0)

    pins.spiWrite(0x02)
    pins.spiWrite((address >> 16) & 255)
    pins.spiWrite((address >> 8) & 255)
    pins.spiWrite(address & 255)

    pins.spiTransfer(data, null)

    pins.digitalWritePin(SRAM_CS, 1)
}

function sramRead(address: number, data: Buffer) {
    deselectAll()
    pins.digitalWritePin(SRAM_CS, 0)

    pins.spiWrite(0x03)
    pins.spiWrite((address >> 16) & 255)
    pins.spiWrite((address >> 8) & 255)
    pins.spiWrite(address & 255)

    pins.spiTransfer(dummy, data)

    pins.digitalWritePin(SRAM_CS, 1)
}

// =============================================
// FAST RECTANGLE
// =============================================

function fillRect(x: number, y: number, w: number, h: number, color: number) {
    if (w <= 0 || h <= 0) return

    lcdWindow(x, y, w, h)

    let hi = (color >> 8) & 255
    let lo = color & 255

    let pixels = w * h
    let bytes = pixels * 2

    for (let i = 0; i < CHUNK; i += 2) {
        tx[i] = hi
        tx[i + 1] = lo
    }

    while (bytes > 0) {
        let count = Math.min(bytes, CHUNK)

        if (count == CHUNK) {
            lcdWriteBuffer(tx)
        } else {
            let small = pins.createBuffer(count)
            for (let i = 0; i < count; i++) {
                small[i] = tx[i]
            }
            lcdWriteBuffer(small)
        }

        bytes -= count
    }
}

// =============================================
// CREATE 3 FRAMES IN SRAM
// =============================================

function createFrames() {
    serial.writeLine("Preparing SRAM frames...")

    for (let frame = 0; frame < 3; frame++) {
        let base = frame * FRAME_BYTES

        for (let address = 0; address < FRAME_BYTES; address += CHUNK) {
            for (let i = 0; i < CHUNK; i += 2) {
                let pixel = Math.idiv(address + i, 2)
                let x = pixel % WIDTH
                let y = Math.idiv(pixel, WIDTH)

                let r = (x + frame * 50) & 31
                let g = (y + frame * 30) & 63
                let b = (x + y + frame * 40) & 31

                let color = (r << 11) | (g << 5) | b

                tx[i] = (color >> 8) & 255
                tx[i + 1] = color & 255
            }

            sramWrite(base + address, tx)
        }
    }

    serial.writeLine("SRAM frames ready")
}

// =============================================
// SHOW SRAM FRAME
// =============================================

function showSRAMFrame(frame: number) {
    lcdWindow(0, 0, WIDTH, HEIGHT)

    let base = frame * FRAME_BYTES

    for (let address = 0; address < FRAME_BYTES; address += CHUNK) {
        sramRead(base + address, rx)
        lcdWriteBuffer(rx)
    }
}

// =============================================
// FPS
// =============================================

function updateFPS() {
    frameCount++

    let now = input.runningTime()

    if (now - fpsStart >= 1000) {
        fps = frameCount * 1000 / (now - fpsStart)

        serial.writeLine(
            "MODE=" + mode +
            " SPI=" + speeds[speedIndex] / 1000000 +
            "MHz FPS=" + fps
        )

        frameCount = 0
        fpsStart = now
    }
}

// =============================================
// DEMO 1 - SRAM ANIMATION
// =============================================

let animationFrame = 0

function demoSRAM() {
    showSRAMFrame(animationFrame)

    animationFrame++
    if (animationFrame >= 3) animationFrame = 0

    updateFPS()
}

// =============================================
// DEMO 2 - MOVING RECTANGLES
// =============================================

let rectX = 0
let rectY = 30
let rectDX = 3
let rectDY = 2

function demoRectangles() {
    fillRect(rectX, rectY, 35, 25, 0x0000)

    rectX += rectDX
    rectY += rectDY

    if (rectX <= 0 || rectX >= 125) rectDX = -rectDX
    if (rectY <= 0 || rectY >= 103) rectDY = -rectDY

    fillRect(rectX, rectY, 35, 25, 0xF800)

    updateFPS()
}

// =============================================
// DEMO 3 - ANIMATED BARS
// =============================================

let barStep = 0

function demoBars() {
    for (let i = 0; i < 8; i++) {
        let height = (barStep * 7 + i * 17) % 100

        fillRect(5 + i * 19, 15, 14, 105, 0x0000)

        let color = 0x001F
        if (i % 3 == 0) color = 0xF800
        if (i % 3 == 1) color = 0x07E0

        fillRect(5 + i * 19, 120 - height, 14, height, color)
    }

    barStep++
    updateFPS()
}

// =============================================
// BUTTONS
// =============================================

input.onButtonPressed(Button.A, function () {
    mode++
    if (mode > 2) mode = 0

    fillRect(0, 0, WIDTH, HEIGHT, 0x0000)

    serial.writeLine("MODE: " + mode)
})

input.onButtonPressed(Button.B, function () {
    speedIndex++
    if (speedIndex >= speeds.length) speedIndex = 0

    setSPI()

    serial.writeLine(
        "SPI: " + speeds[speedIndex] / 1000000 + " MHz"
    )
})

input.onButtonPressed(Button.AB, function () {
    serial.writeLine("FPS: " + fps)
})

// =============================================
// START
// =============================================

deselectAll()

pins.spiPins(
    DigitalPin.P15,
    DigitalPin.P14,
    DigitalPin.P13
)

pins.spiFormat(8, 0)
setSPI()

serial.redirectToUSB()

lcdInit()
createFrames()

fillRect(0, 0, WIDTH, HEIGHT, 0x0000)

fpsStart = input.runningTime()

serial.writeLine("==========================")
serial.writeLine("FAST GRAPHICS DEMO")
serial.writeLine("A = MODE")
serial.writeLine("B = SPI SPEED")
serial.writeLine("A+B = FPS")
serial.writeLine("==========================")

basic.forever(function () {
    if (mode == 0) demoSRAM()
    if (mode == 1) demoRectangles()
    if (mode == 2) demoBars()
})