const modbus = require('jsmodbus')
const net = require('net')

// Create TCP server for now (easier to debug, switch to RTU if needed)

const server = new net.Server()
const holding = Buffer.alloc(4) // 2 registers x 2 bytes each

// Initialize with zero load
// holding.writeUInt16BE(0, 0)

server.listen(8502, () => {
  console.log('✅ SAMAA Load Cell Slave Simulator started on port 8502')
})

const serverTCP = new modbus.server.TCP(server, {
  holding: holding,
})

// Initial test value
let testLoadKg = 0 // Start from 0 for realistic lift simulation

serverTCP.on('connection', () => {
  console.log('✅ Master connected to SAMAA Load Cell Slave Simulator')
})

// Increment weight to simulate lifting
const maxLoadKg = 100000 // 100 tons in kg

const incrementInterval = setInterval(() => {
  if (testLoadKg < maxLoadKg) {
    const increment = Math.random() * 100 + 50 // 50-150 kg increments
    testLoadKg += increment
    if (testLoadKg > maxLoadKg) testLoadKg = maxLoadKg

    const scaledLoad = Math.round(testLoadKg * 10) // kg x 10, per DLC-6
    holding.writeUInt16BE((scaledLoad >> 16) & 0xffff, 0) // High word if needed
    holding.writeUInt16BE(scaledLoad & 0xffff, 2) // Low word

    console.log(
      `Simulated Load: ${testLoadKg.toFixed(2)} kg (${(
        testLoadKg / 1000
      ).toFixed(2)} tons) | Raw: ${scaledLoad}`
    )
  }
}, 1000) // Update every 2 seconds for realistic lift speed
