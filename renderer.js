const ModbusRTU = require('modbus-serial')
const fs = require('fs')
const path = require('path')
const Chart = require('chart.js/auto')
const PDFDocument = require('pdfkit')
const client = new ModbusRTU()
let pollingInterval = null
let chartData = [] // [{ time: 'HH:MM:SS', load: 0.000 }]
let chartInstance = null
let testMetadata = {} // store form data

const form = document.getElementById('testForm')
const startButton = document.getElementById('startButton')

startButton.disabled = false
stopButton.disabled = true

// Enable Start button only when all fields are filled
// form.addEventListener('input', () => {
//   const allInputs = Array.from(form.elements).filter(
//     (el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
//   )
//   const allFilled = allInputs.every((input) => input.value.trim() !== '')
//   startButton.disabled = !allFilled
// })

// Collect form data and save JSON
function collectAndSaveMetadata() {
  const formData = new FormData(form)
  testMetadata = Object.fromEntries(formData.entries())
  const capacityRaw = formData.get('ratedLoadCapacity')
  const capacity = parseFloat(capacityRaw)
  if (isNaN(capacity)) {
    alert(
      '⚠️ Capacity value is invalid or missing. Please enter a valid number.'
    )
    return
  }
  // Add to formData for consistency

  const proofLoad = capacity * 1.1
  testMetadata.proofLoad = proofLoad.toFixed(2) // keep 2 decimals

  const reportsDir = path.join(__dirname, 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir)

  const filename = `test_metadata_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.json`
  const filepath = path.join(reportsDir, filename)
  fs.writeFileSync(filepath, JSON.stringify(testMetadata, null, 2))

  console.log(`✅ Test metadata saved: ${filepath}`)
}

async function startPolling() {
  // Disable Start temporarily to prevent double clicks while connecting
  startButton.disabled = true
  stopButton.disabled = true

  if (pollingInterval) {
    console.warn('⚠️ Polling already in progress. Ignoring duplicate start.')
    alert('Polling is already running.')
    return
  }

  try {
    collectAndSaveMetadata()
    updateStatus('Status: Connecting...', 'info')

    if (!client.isOpen) {
      await client.connectTCP('127.0.0.1', { port: 8502 })
      client.setID(1)

      console.log('✅ Connected to Modbus server.')
    } else {
      console.log('ℹ️ Modbus client already connected.')
    }

    updateStatus('Status: Connected. Polling...', 'success')
    startButton.disabled = true
    stopButton.disabled = false

    pollingInterval = setInterval(async () => {
      try {
        const timestamp = new Date().toLocaleTimeString()
        const data = await client.readHoldingRegisters(0, 2) // 0x0001 and 0x0002
        const registers = data.data
        const high = registers[0]
        const low = registers[1]
        const combined = (high << 16) | low // 32-bit combined value

        const loadKg = combined / 10 // DLC-6 scaling
        const loadTons = loadKg / 1000 // Display in tons
        chartData.push({ time: timestamp, load: loadTons })
        renderChart()

        document.getElementById('loadValue').innerText = `${loadTons.toFixed(
          3
        )} t`

        console.log(
          `✅ Live Load: ${loadKg.toFixed(1)} kg (${loadTons.toFixed(
            3
          )} t) [Raw: ${combined}]`
        )

        document.getElementById(
          'lastTimestamp'
        ).innerText = `Last Update: ${timestamp}`

        // Append to table for tracking history
        const tableBody = document.getElementById('dataTableBody')
        const row = document.createElement('tr')
        row.innerHTML = `
          <td>${timestamp}</td>
          <td>${loadKg.toFixed(1)} kg</td>
          <td>${loadTons.toFixed(3)} t</td>
        `
        tableBody.appendChild(row)
        // Auto-scroll to bottom for live monitoring
        const logWrapper = document.getElementById('logWrapper')
        logWrapper.scrollTop = logWrapper.scrollHeight

        console.log(
          `✅ Load: ${loadKg.toFixed(1)} kg (${loadTons.toFixed(
            3
          )} t) at ${timestamp}`
        )
        // (Chart.js live graph will be added next)
      } catch (err) {
        console.error('⚠️ Polling error:', err)
        updateStatus('Status: Polling Error', 'error')
        startButton.disabled = false
        stopButton.disabled = true
      }
    }, 500) // 1-second polling
  } catch (err) {
    console.error('❌ Connection error:', err)
    updateStatus('Status: Connection Failed', 'error')
    startButton.disabled = false
    stopButton.disabled = true
  }
}

function updateStatus(text, statusType = 'info') {
  const statusEl = document.getElementById('status')
  statusEl.innerText = text
  if (statusType === 'info') {
    statusEl.style.background = '#e0e7ef'
    statusEl.style.color = '#0a3a71'
  } else if (statusType === 'success') {
    statusEl.style.background = '#d4edda'
    statusEl.style.color = '#155724'
  } else if (statusType === 'error') {
    statusEl.style.background = '#f8d7da'
    statusEl.style.color = '#721c24'
  } else if (statusType === 'warning') {
    statusEl.style.background = '#fff3cd'
    statusEl.style.color = '#856404'
  }
}

function stopPolling() {
  startButton.disabled = false
  stopButton.disabled = true

  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
    console.log('✅ Polling stopped.')
  } else {
    console.log('ℹ️ No polling was running.')
  }

  if (client.isOpen) {
    client.close(() => console.log('✅ Connection closed.'))
  }

  updateStatus('Status: Stopped', 'warning')

  renderChart()
}

function getTableData() {
  const data = []
  const rows = document.querySelectorAll('#dataTableBody tr')
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td')
    data.push([
      cells[0]?.textContent || '',
      cells[1]?.textContent || '',
      cells[2]?.textContent || '',
    ])
  })
  return data
}
function renderChart() {
  const canvas = document.getElementById('loadChart')
  if (!canvas) {
    console.warn('⚠️ loadChart element not found.')
    return
  }
  const ctx = canvas.getContext('2d')
  const labels = chartData.map((item) => item.time)
  const data = chartData.map((item) => item.load)

  if (chartInstance) {
    // Update existing chart
    chartInstance.data.labels = labels
    chartInstance.data.datasets[0].data = data
    chartInstance.update()
  } else {
    // Create new chart
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Load (tons)',
            data,
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 2,
            fill: false,
            pointRadius: 2,
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          x: { title: { display: true, text: 'Time' } },
          y: { title: { display: true, text: 'Load (tons)' } },
        },
        plugins: { legend: { display: false } },
      },
    })
  }
}

function downloadReport() {
  try {
    const footerHeight = 15

    if (
      !testMetadata ||
      typeof testMetadata !== 'object' ||
      Object.keys(testMetadata).length === 0
    ) {
      alert('⚠️ No test metadata available. Please start polling first.')
      return
    }

    const tableData = getTableData()
    if (!Array.isArray(tableData) || tableData.length === 0) {
      alert('⚠️ No test data recorded.')
      return
    }

    // Calculate peakValue
    let peakValue = 0
    tableData.forEach((row) => {
      const loadKg = parseFloat(row[1])
      if (!isNaN(loadKg)) {
        const loadTon = loadKg / 1000
        if (loadTon > peakValue) {
          peakValue = loadTon
        }
      }
    })

    const reportsDir = path.join(__dirname, 'reports')
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir)
    }

    const fileName = `Load_Test_Certificate_${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.pdf`
    const filePath = path.join(reportsDir, fileName)

    const doc = new PDFDocument({ margin: 50, autoFirstPage: true })
    const stream = fs.createWriteStream(filePath)
    doc.pipe(stream)

    let pageNumber = 0

    function addFooter() {
      try {
        pageNumber++ // increment first

        const bottom = doc.page.margins.bottom
        doc.page.margins.bottom = 0

        const footerY = doc.page.height - 40

        // Always show company name on ALL pages
        doc
          .fontSize(10)
          .fillColor('gray')
          .text('Samaa Aerospace LLP', 50, footerY, { align: 'left' })

        // Show page number only from page 2 onwards
        if (pageNumber > 1) {
          doc.text(`Page ${pageNumber}`, -50, doc.page.height - 40, {
            align: 'right',
          })
        }

        doc.text('', 50, 50) // reset cursor
        doc.page.margins.bottom = bottom
      } catch (err) {
        console.error('⚠️ Footer rendering error:', err)
      }
    }

    addFooter() // Footer on first page
    doc.on('pageAdded', addFooter)

    const x = doc.page.margins.left
    let y = doc.page.margins.top
    const col1Width = 250
    const col2Width = 250
    const rowHeight = 20
    const companyName = testMetadata.companyName || 'AAR Indamer Technics'

    const logoPath = path.join(__dirname, 'assets', 'indamer.png')
    if (fs.existsSync(logoPath)) {
      const logoWidth = 80
      const logoHeight = 60
      const logoX = doc.page.width - doc.page.margins.right - logoWidth
      const logoY = doc.page.margins.top
      doc.image(logoPath, logoX, logoY, {
        width: logoWidth,
        height: logoHeight,
      })
    }

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('black')
      .text(companyName, { align: 'center' })
    y = doc.y + 10

    // === HEADER ===
    // Title aligned with logo
    doc
      .fontSize(12)
      .fillColor('black')
      //   .font('Helvetica-Bold')
      .text(`Load Test Certificate`, {
        align: 'center',
        continued: false,
      })

    // Add slight vertical spacing
    y = doc.y + 5

    // Test Date with "value" bold
    const testDate = testMetadata.testDate || new Date().toLocaleDateString()
    //  Calculate certificate validity (1 year from test date)
    const testDateObj = new Date(testMetadata.testDate || Date.now())
    const validityDate = new Date(testDateObj)
    validityDate.setFullYear(validityDate.getFullYear() + 1)
    const validityDateStr = validityDate.toLocaleDateString()
    doc
      .fontSize(8)
      .fillColor('black')
      .font('Helvetica')
      .text('Test Date: ', x, y, { continued: true })
      .font('Helvetica-Bold')
      .text(testDate)
    y = doc.y + 7 // add extra space before metadata block
    doc
      .fontSize(8)
      .fillColor('black')
      .font('Helvetica')
      .text('Certificate Valid Upto: ', x, y, { continued: true })
      .font('Helvetica-Bold')
      .text(validityDateStr)

    y = doc.y + 15 // Adjust spacing before metadata table

    // === METADATA TABLE ===
    // doc.fontSize(14).text('Test Metadata:', { underline: true })
    // y = doc.y + 10

    // 1) Remove redundant keys and remove proofLoad
    const metadataEntries = Object.entries(testMetadata).filter(
      ([key]) => !['testedBy', 'certifiedBy', 'proofLoad'].includes(key)
    )

    // 2) Segregate Master & Tested fields while maintaining current field names
    const masterFieldKeys = [
      'loadCellPartNo',
      'loadCellSerialNo',
      'loadCellModelNo',
      'loadCellLastCalibrationDate',
      'loadCellCalibrationValidity',
      'displayPartNo',
      'displaySerialNo',
      'displayModelNo',
      'displayLastCalibrationDate',
      'displayCalibrationValidity',
    ]
    const testedFieldKeys = [
      'equipmentName',
      'typeOfEquipment',
      'equipmentPartNo',
      'equipmentSerialNo',
      'equipmentModelNo',
      'yearOfManufacture',
      'ratedLoadCapacity',
      'location',
    ]

    const masterEntries = metadataEntries.filter(([key]) =>
      masterFieldKeys.includes(key)
    )
    const testedEntries = metadataEntries.filter(([key]) =>
      testedFieldKeys.includes(key)
    )

    const renderSection = (title, entries) => {
      // Add section heading
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('black')
        .text(title, x, y)
      y = doc.y + 5
      doc.fontSize(9).font('Helvetica')

      const half = Math.ceil(entries.length / 2)
      const leftEntries = entries.slice(0, half)
      const rightEntries = entries.slice(half)

      const colGap = 30
      const colWidth =
        (doc.page.width -
          doc.page.margins.left -
          doc.page.margins.right -
          colGap) /
        2
      const keyWidth = 130 // slightly increased for breathing space
      const valueWidth = colWidth - keyWidth - 10
      const adjustedRowHeight = 22

      for (let i = 0; i < half; i++) {
        const left = leftEntries[i]
        const right = rightEntries[i]
        let rowHeight = adjustedRowHeight

        if (left) {
          const [keyL, valueL] = left
          const cleanKeyL = keyL
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()
          const hL = Math.max(
            doc.heightOfString(`${cleanKeyL}:`, { width: keyWidth }),
            doc.heightOfString(valueL, { width: valueWidth })
          )
          rowHeight = Math.max(rowHeight, hL + 6)
        }
        if (right) {
          const [keyR, valueR] = right
          const cleanKeyR = keyR
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()
          const hR = Math.max(
            doc.heightOfString(`${cleanKeyR}:`, { width: keyWidth }),
            doc.heightOfString(valueR, { width: valueWidth })
          )
          rowHeight = Math.max(rowHeight, hR + 6)
        }

        // Shading
        if (i % 2 === 0) {
          doc.save()
          doc.rect(x, y, colWidth * 2 + colGap, rowHeight).fill('#f9f9f9')
          doc.restore()
        }

        if (left) {
          const [keyL, valueL] = left
          const cleanKeyL = keyL
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()
          doc
            .fillColor('black')
            .text(`${cleanKeyL}:`, x + 5, y + 3, { width: keyWidth })
          doc.text(`${valueL}`, x + 5 + keyWidth, y + 3, { width: valueWidth })
        }
        if (right) {
          const [keyR, valueR] = right
          const cleanKeyR = keyR
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()
          const rightX = x + colWidth + colGap
          doc
            .fillColor('black')
            .text(`${cleanKeyR}:`, rightX + 5, y + 3, { width: keyWidth })
          doc.text(`${valueR}`, rightX + 5 + keyWidth, y + 3, {
            width: valueWidth,
          })
        }

        y += rowHeight
      }

      y += 15 // spacing between sections
    }

    // === Render the sections ===
    renderSection('Master Calibration Data', masterEntries)
    renderSection('Tested Equipment Data', testedEntries)

    y += 10 // Padding before chart

    const chartCanvas = document.getElementById('loadChart')
    const chartImage = chartCanvas ? chartCanvas.toDataURL('image/png') : null
    if (chartImage) {
      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right
      const imageWidth = pageWidth
      const imageHeight = 225
      const imageX = doc.page.margins.left + (pageWidth - imageWidth) / 2

      doc
        .fontSize(10)
        .fillColor('black')
        .text('Load vs Time Chart:', doc.page.margins.left, y, {
          align: 'center',
          width: pageWidth, // ensure true centering
        })
      y = doc.y + 5
      doc.image(chartImage, imageX, y, {
        width: imageWidth,
        height: imageHeight,
      })
      y += imageHeight + 10

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('black')
        .text(
          `Peak Load During Test: ${peakValue} T`,
          doc.page.margins.left,
          y,
          {
            align: 'center',
            width: pageWidth, // ensure true centering
          }
        )
      y = doc.y + 15
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('black')
        .text(`Proof Load Test Value: ${testMetadata.proofLoad} T`, {
          align: 'center',
        })
      y = doc.y + 15
      //   y += imageHeight + 20
    }
    y += 20
    // === SIGNATURE BLOCK ===
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`Tested By: ${testMetadata.testedBy || ''}`, x, y)
      .text(`Certified By: ${testMetadata.certifiedBy || ''}`, x + 250, y)
    y += 15
    // doc.font('Helvetica').text(`Location: ${testMetadata.location || ''}`, x, y)
    // y += 15

    // === FORCE TEST DATA TO NEW PAGE ===
    doc.addPage()
    y = doc.page.margins.top
    // doc.fontSize(14).text('Test Data:', { underline: true })
    y = doc.y + 10

    const colTimeWidth = 180
    const colKgWidth = 160
    const colTonsWidth = 160

    // Test Data Table Header
    doc.save()
    doc
      .rect(x, y, colTimeWidth + colKgWidth + colTonsWidth, rowHeight)
      .fill('#e6e6e6')
    doc
      .fillColor('black')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Timestamp', x + 5, y + 5, { width: colTimeWidth - 10 })
      .text('Load (kg)', x + colTimeWidth + 5, y + 5, {
        width: colKgWidth - 10,
        align: 'center',
      })
      .text('Load (t)', x + colTimeWidth + colKgWidth + 5, y + 5, {
        width: colTonsWidth - 10,
        align: 'center',
      })
    doc.restore()
    y += rowHeight

    tableData.forEach((row, index) => {
      if (
        y + rowHeight >
        doc.page.height - doc.page.margins.bottom - footerHeight - 10
      ) {
        doc.addPage()
        y = doc.page.margins.top

        // Redraw table header
        doc.save()
        doc
          .rect(x, y, colTimeWidth + colKgWidth + colTonsWidth, rowHeight)
          .fill('#e6e6e6')
        doc
          .fillColor('black')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text('Timestamp', x + 5, y + 5, { width: colTimeWidth - 10 })
          .text('Load (kg)', x + colTimeWidth + 5, y + 5, {
            width: colKgWidth - 10,
            align: 'center',
          })
          .text('Load (t)', x + colTimeWidth + colKgWidth + 5, y + 5, {
            width: colTonsWidth - 10,
            align: 'center',
          })
        doc.restore()
        y += rowHeight
      }

      doc.save()
      if (index % 2 === 0) {
        doc
          .rect(x, y, colTimeWidth + colKgWidth + colTonsWidth, rowHeight)
          .fill('#f9f9f9')
      }
      doc.restore()

      doc
        .fillColor('black')
        .font('Helvetica')
        .fontSize(10)
        .text(row[0] || '', x + 5, y + 5, { width: colTimeWidth - 10 })
        .text(row[1] || '', x + colTimeWidth + 5, y + 5, {
          width: colKgWidth - 10,
          align: 'center',
        })
        .text(row[2] || '', x + colTimeWidth + colKgWidth + 5, y + 5, {
          width: colTonsWidth - 10,
          align: 'center',
        })
      y += rowHeight
    })

    // y += 30

    doc.end()

    stream.on('finish', () => {
      alert(`✅ PDF report saved as ${fileName}`)
      console.log(`📄 PDF report saved: ${filePath}`)
      // ✅ Reset form fields
      form.reset()

      // ✅ Clear live data table
      document.getElementById('dataTableBody').innerHTML = ''

      // ✅ Optionally reset status and live readings
      //   document.getElementById('loadValue').innerText = ''
      //   document.getElementById('lastTimestamp').innerText = ''
      startButton.disabled = false
      stopButton.disabled = true
      updateStatus('Status: Ready', 'info')
    })

    stream.on('error', (err) => {
      console.error('❌ PDF generation error:', err)
      alert('❌ Failed to generate PDF report. Check console for details.')
    })
  } catch (err) {
    console.error('❌ Unexpected error during PDF generation:', err)
    alert('❌ Unexpected error during PDF generation.')
  }
}

// Button Bindings
document.getElementById('startButton').addEventListener('click', startPolling)
document.getElementById('stopButton').addEventListener('click', stopPolling)
document
  .getElementById('downloadButton')
  .addEventListener('click', downloadReport)
document.getElementById('clearDataButton').addEventListener('click', () => {
  if (
    chartData.length === 0 &&
    document.getElementById('dataTableBody').children.length === 0
  ) {
    alert('⚠️ No data to clear.')
    return
  }

  if (confirm('Clear all collected data? This cannot be undone.')) {
    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
      console.log('✅ Polling stopped due to data clear.')
    }
    // ✅ Close Modbus client if open
    if (client.isOpen) {
      client.close(() => console.log('✅ Modbus client disconnected on clear.'))
    }
    chartData = []
    if (chartInstance) {
      chartInstance.destroy()
      chartInstance = null
    }
    document.getElementById('dataTableBody').innerHTML = ''
    document.getElementById('loadValue').innerText = ''
    document.getElementById('lastTimestamp').innerText = ''
    updateStatus('Status: Ready', 'info')
    // Clear form
    if (form) form.reset()
    // ✅ Reset buttons
    startButton.disabled = false
    stopButton.disabled = true
    // ✅ Status
    updateStatus('Status: Ready', 'info')
    alert('✅ Data cleared.')
  }
})
