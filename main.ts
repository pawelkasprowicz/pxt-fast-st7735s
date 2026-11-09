serial.redirectToUSB()
serial.setBaudRate(BaudRate.BaudRate115200)

basic.pause(1000)

serial.writeLine("START TESTU")

serial.writeLine("INIT START")
fastLCD.init()
serial.writeLine("INIT OK")

fastLCD.setLCDSpeed(fastLCD.Speed.MHz8)

serial.writeLine("CLEAR START")
fastLCD.clear(0)
serial.writeLine("CLEAR OK")

serial.writeLine("PIXEL START")
fastLCD.pixel(80, 64, 65535)
serial.writeLine("PIXEL OK")

serial.writeLine("RECTANGLE START")
fastLCD.fillRect(20, 20, 100, 40, 63488)
serial.writeLine("RECTANGLE OK")

basic.showIcon(IconNames.Yes)

serial.writeLine("TEST ZAKONCZONY")