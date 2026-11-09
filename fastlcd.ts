/**
 * Fast ST7735S LCD + 23LC1024 SRAM
 * BBC micro:bit V2
 * Microsoft MakeCode
 */

//% color=#177B8D icon="\uf108" block="Fast LCD"
namespace fastLCD {

    export enum Speed {
        //% block="1 MHz"
        MHz1 = 1000000,
        //% block="2 MHz"
        MHz2 = 2000000,
        //% block="4 MHz"
        MHz4 = 4000000,
        //% block="8 MHz"
        MHz8 = 8000000,
        //% block="16 MHz"
        MHz16 = 16000000,
        //% block="32 MHz"
        MHz32 = 32000000
    }

    export enum Color {
        Black = 0x0000,
        White = 0xFFFF,
        Red = 0xF800,
        Green = 0x07E0,
        Blue = 0x001F,
        Yellow = 0xFFE0,
        Cyan = 0x07FF,
        Magenta = 0xF81F
    }

    export enum DrawTarget {
        LCD = 0,
        SRAM = 1
    }

    const W = 160
    const H = 128
    const FRAME = 40960
    const CHUNK = 4096

    let lcdCS = DigitalPin.P16
    let lcdDC = DigitalPin.P12
    let lcdRST = DigitalPin.P8
    let ramCS = DigitalPin.P2

    let mosi = DigitalPin.P15
    let miso = DigitalPin.P14
    let sck = DigitalPin.P13

    let lcdHz = 32000000
    let ramHz = 32000000

    let target = DrawTarget.LCD
    let frame = 0
    let initialized = false

    let fillBuf = pins.createBuffer(CHUNK)
    let readBuf = pins.createBuffer(CHUNK)
    let dummyBuf = pins.createBuffer(CHUNK)
    let rxBuf = pins.createBuffer(CHUNK)

    let dirty = false
    let dx0 = W
    let dy0 = H
    let dx1 = -1
    let dy1 = -1

    function allOff() {
        pins.digitalWritePin(lcdCS, 1)
        pins.digitalWritePin(ramCS, 1)
    }

    function speed(hz: number) {
        pins.spiFormat(8, 0)
        pins.spiFrequency(hz)
    }

    function cmd(value: number) {
        allOff()
        pins.digitalWritePin(lcdDC, 0)
        pins.digitalWritePin(lcdCS, 0)
        pins.spiWrite(value)
        pins.digitalWritePin(lcdCS, 1)
    }

    function dat(value: number) {
        allOff()
        pins.digitalWritePin(lcdDC, 1)
        pins.digitalWritePin(lcdCS, 0)
        pins.spiWrite(value)
        pins.digitalWritePin(lcdCS, 1)
    }

    function window(x: number, y: number, w: number, h: number) {
        speed(lcdHz)

        cmd(0x2A)
        dat(0)
        dat(x + 1)
        dat(0)
        dat(x + w)

        cmd(0x2B)
        dat(0)
        dat(y + 2)
        dat(0)
        dat(y + h + 1)

        cmd(0x2C)
    }

    function lcdSend(data: Buffer) {
        speed(lcdHz)
        allOff()

        pins.digitalWritePin(lcdDC, 1)
        pins.digitalWritePin(lcdCS, 0)

        if (data.length == CHUNK) {
            pins.spiTransfer(data, rxBuf)
        } else {
            let receive = pins.createBuffer(data.length)
            pins.spiTransfer(data, receive)
        }

        pins.digitalWritePin(lcdCS, 1)
    }

    function ramHeader(op: number, address: number) {
        speed(ramHz)
        allOff()

        pins.digitalWritePin(ramCS, 0)

        pins.spiWrite(op)
        pins.spiWrite((address >> 16) & 255)
        pins.spiWrite((address >> 8) & 255)
        pins.spiWrite(address & 255)
    }

    function ramWrite(address: number, data: Buffer) {
        ramHeader(0x02, address)

        if (data.length == CHUNK) {
            pins.spiTransfer(data, rxBuf)
        } else {
            let receive = pins.createBuffer(data.length)
            pins.spiTransfer(data, receive)
        }

        pins.digitalWritePin(ramCS, 1)
    }

    function ramRead(address: number, data: Buffer) {
        ramHeader(0x03, address)

        if (data.length == CHUNK) {
            pins.spiTransfer(dummyBuf, data)
        } else {
            let dummy = pins.createBuffer(data.length)
            pins.spiTransfer(dummy, data)
        }

        pins.digitalWritePin(ramCS, 1)
    }

    function frameBase(): number {
        return frame * FRAME
    }

    function mark(x: number, y: number, w: number, h: number) {
        dirty = true

        dx0 = Math.min(dx0, x)
        dy0 = Math.min(dy0, y)

        dx1 = Math.max(dx1, x + w - 1)
        dy1 = Math.max(dy1, y + h - 1)
    }

    function clearDirty() {
        dirty = false
        dx0 = W
        dy0 = H
        dx1 = -1
        dy1 = -1
    }

    function solidBuffer(buf: Buffer, color: number) {
        let hi = (color >> 8) & 255
        let lo = color & 255

        for (let i = 0; i < buf.length; i += 2) {
            buf[i] = hi
            buf[i + 1] = lo
        }
    }

    function sendSolid(
        bytes: number,
        color: number,
        toRam: boolean,
        address: number
    ) {
        solidBuffer(fillBuf, color)

        while (bytes > 0) {
            let n = Math.min(bytes, CHUNK)
            let data: Buffer

            if (n == CHUNK) {
                data = fillBuf
            } else {
                data = pins.createBuffer(n)

                for (let i = 0; i < n; i++) {
                    data[i] = fillBuf[i]
                }
            }

            if (toRam) {
                ramWrite(address, data)
            } else {
                lcdSend(data)
            }

            address += n
            bytes -= n
        }
    }

    function clip(
        x: number,
        y: number,
        w: number,
        h: number
    ): number[] {
        let x0 = Math.max(0, x)
        let y0 = Math.max(0, y)

        let x1 = Math.min(W, x + w)
        let y1 = Math.min(H, y + h)

        return [x0, y0, x1 - x0, y1 - y0]
    }

    /**
     * Configure LCD and SRAM pins
     */
    //% block="LCD pins CS %cs DC %dc RST %rst SRAM CS %sram"
    //% advanced=true
    export function setPins(
        cs: DigitalPin,
        dc: DigitalPin,
        rst: DigitalPin,
        sram: DigitalPin
    ) {
        lcdCS = cs
        lcdDC = dc
        lcdRST = rst
        ramCS = sram
    }

    /**
     * Configure SPI pins
     */
    //% block="LCD SPI MOSI %out MISO %input SCK %clock"
    //% advanced=true
    export function setSPIPins(
        out: DigitalPin,
        input: DigitalPin,
        clock: DigitalPin
    ) {
        mosi = out
        miso = input
        sck = clock
    }

    /**
     * LCD SPI speed
     */
    //% block="LCD SPI speed %value"
    export function setLCDSpeed(value: Speed) {
        lcdHz = value
    }

    /**
     * SRAM SPI speed
     */
    //% block="SRAM SPI speed %value"
    export function setSRAMSpeed(value: Speed) {
        ramHz = value
    }

    /**
     * Initialize LCD and SRAM
     */
    //% block="initialize fast LCD"
    export function init() {
        allOff()

        pins.spiPins(mosi, miso, sck)
        speed(lcdHz)

        pins.digitalWritePin(lcdRST, 1)
        basic.pause(10)

        pins.digitalWritePin(lcdRST, 0)
        basic.pause(20)

        pins.digitalWritePin(lcdRST, 1)
        basic.pause(120)

        cmd(0x01)
        basic.pause(150)

        cmd(0x11)
        basic.pause(150)

        cmd(0x3A)
        dat(0x05)

        cmd(0x36)
        dat(0xA0)

        cmd(0x29)
        basic.pause(100)

        // SRAM sequential mode
        speed(ramHz)
        allOff()

        pins.digitalWritePin(ramCS, 0)
        pins.spiWrite(0x01)
        pins.spiWrite(0x40)
        pins.digitalWritePin(ramCS, 1)

        initialized = true
        target = DrawTarget.LCD

        clearDirty()
    }

    /**
     * Select drawing destination
     */
    //% block="draw to %destination"
    export function drawTo(destination: DrawTarget) {
        target = destination
    }

    /**
     * Select SRAM framebuffer 0, 1 or 2
     */
    //% block="SRAM frame %index"
    //% index.min=0 index.max=2
    export function selectFrame(index: number) {
        if (index < 0 || index > 2) return

        frame = index
        clearDirty()
    }

    /**
     * Fill rectangle
     */
    //% block="fill rectangle x %x y %y width %w height %h color %color"
    export function fillRect(
        x: number,
        y: number,
        w: number,
        h: number,
        color: number
    ) {
        if (!initialized) return

        let r = clip(x, y, w, h)

        x = r[0]
        y = r[1]
        w = r[2]
        h = r[3]

        if (w <= 0 || h <= 0) return

        if (target == DrawTarget.LCD) {
            window(x, y, w, h)
            sendSolid(w * h * 2, color, false, 0)
        } else {
            for (let row = 0; row < h; row++) {
                let addr =
                    frameBase() +
                    ((y + row) * W + x) * 2

                sendSolid(w * 2, color, true, addr)
            }

            mark(x, y, w, h)
        }
    }

    /**
     * Clear LCD or SRAM framebuffer
     */
    //% block="clear color %color"
    export function clear(color: number) {
        if (!initialized) return

        if (target == DrawTarget.LCD) {
            window(0, 0, W, H)
            sendSolid(FRAME, color, false, 0)
        } else {
            sendSolid(FRAME, color, true, frameBase())
            mark(0, 0, W, H)
        }
    }

    /**
     * Draw a pixel
     */
    //% block="pixel x %x y %y color %color"
    export function pixel(
        x: number,
        y: number,
        color: number
    ) {
        if (x < 0 || x >= W) return
        if (y < 0 || y >= H) return

        fillRect(x, y, 1, 1, color)
    }

    /**
     * Draw a line
     */
    //% block="line x1 %x0 y1 %y0 x2 %x1 y2 %y1 color %color"
    export function line(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        color: number
    ) {
        let ddx = Math.abs(x1 - x0)
        let sx = x0 < x1 ? 1 : -1

        let ddy = -Math.abs(y1 - y0)
        let sy = y0 < y1 ? 1 : -1

        let err = ddx + ddy

        while (true) {
            pixel(x0, y0, color)

            if (x0 == x1 && y0 == y1) break

            let e2 = 2 * err

            if (e2 >= ddy) {
                err += ddy
                x0 += sx
            }

            if (e2 <= ddx) {
                err += ddx
                y0 += sy
            }
        }
    }

    /**
     * Draw rectangle outline
     */
    //% block="rectangle x %x y %y width %w height %h color %color"
    export function rect(
        x: number,
        y: number,
        w: number,
        h: number,
        color: number
    ) {
        if (w <= 0 || h <= 0) return

        fillRect(x, y, w, 1, color)
        fillRect(x, y + h - 1, w, 1, color)
        fillRect(x, y, 1, h, color)
        fillRect(x + w - 1, y, 1, h, color)
    }

    /**
     * Draw circle outline
     */
    //% block="circle x %cx y %cy radius %radius color %color"
    export function circle(
        cx: number,
        cy: number,
        radius: number,
        color: number
    ) {
        if (radius < 0) return

        let x = radius
        let y = 0
        let err = 1 - x

        while (x >= y) {
            pixel(cx + x, cy + y, color)
            pixel(cx + y, cy + x, color)
            pixel(cx - y, cy + x, color)
            pixel(cx - x, cy + y, color)

            pixel(cx - x, cy - y, color)
            pixel(cx - y, cy - x, color)
            pixel(cx + y, cy - x, color)
            pixel(cx + x, cy - y, color)

            y++

            if (err < 0) {
                err += 2 * y + 1
            } else {
                x--
                err += 2 * (y - x) + 1
            }
        }
    }

    /**
     * Show complete SRAM framebuffer
     */
    //% block="show full SRAM frame"
    export function show() {
        if (!initialized) return

        window(0, 0, W, H)

        for (
            let offset = 0;
            offset < FRAME;
            offset += CHUNK
        ) {
            ramRead(frameBase() + offset, readBuf)
            lcdSend(readBuf)
        }

        clearDirty()
    }

    /**
     * Show changed SRAM region
     */
    //% block="show changed SRAM area"
    export function showChanged() {
        if (!initialized || !dirty) return

        let x = dx0
        let y = dy0

        let w = dx1 - dx0 + 1
        let h = dy1 - dy0 + 1

        if (w <= 0 || h <= 0) {
            clearDirty()
            return
        }

        window(x, y, w, h)

        for (let row = 0; row < h; row++) {
            let addr =
                frameBase() +
                ((y + row) * W + x) * 2

            let rowBuf = pins.createBuffer(w * 2)

            ramRead(addr, rowBuf)
            lcdSend(rowBuf)
        }

        clearDirty()
    }

    /**
     * Convert RGB888 to RGB565
     */
    //% block="RGB565 red %r green %g blue %b"
    export function rgb(
        r: number,
        g: number,
        b: number
    ): number {
        r = Math.max(0, Math.min(255, r))
        g = Math.max(0, Math.min(255, g))
        b = Math.max(0, Math.min(255, b))

        return (
            ((r >> 3) << 11) |
            ((g >> 2) << 5) |
            (b >> 3)
        )
    }
}