// TEST 3 OBRAZOW W SRAM
// ST7735S + 23LC1024 + micro:bit V2

fastLCD.init()

fastLCD.setLCDSpeed(fastLCD.Speed.MHz32)
fastLCD.setSRAMSpeed(fastLCD.Speed.MHz32)

// OBRAZ 0 - CZERWONY
fastLCD.selectFrame(0)
fastLCD.drawTo(fastLCD.DrawTarget.SRAM)
fastLCD.clear(0xF800)
fastLCD.fillRect(30, 20, 100, 80, 0xFFFF)

// OBRAZ 1 - ZIELONY
fastLCD.selectFrame(1)
fastLCD.drawTo(fastLCD.DrawTarget.SRAM)
fastLCD.clear(0x07E0)
fastLCD.circle(80, 64, 40, 0x0000)

// OBRAZ 2 - NIEBIESKI
fastLCD.selectFrame(2)
fastLCD.drawTo(fastLCD.DrawTarget.SRAM)
fastLCD.clear(0x001F)
fastLCD.line(0, 0, 159, 127, 0xFFFF)
fastLCD.line(159, 0, 0, 127, 0xFFFF)

// Wyswietlamy pierwszy obraz
let obraz = 0
fastLCD.selectFrame(obraz)
fastLCD.show()

basic.showNumber(obraz)

// PRZYCISK A - NASTEPNY OBRAZ
input.onButtonPressed(Button.A, function () {
    obraz = (obraz + 1) % 3

    fastLCD.selectFrame(obraz)
    fastLCD.show()

    basic.showNumber(obraz)
})

// PRZYCISK B - POPRZEDNI OBRAZ
input.onButtonPressed(Button.B, function () {
    obraz = (obraz + 2) % 3

    fastLCD.selectFrame(obraz)
    fastLCD.show()

    basic.showNumber(obraz)
})