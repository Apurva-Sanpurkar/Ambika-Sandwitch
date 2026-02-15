export const printBill = async (orderData) => {
    try {
      // 1. Request the Bluetooth Device (Thermal Printer)
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }], // Standard for many BT printers
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });
  
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
  
      // 2. Format the Bill (matching your Golden Dragon reference)
      const encoder = new TextEncoder();
      const date = new Date().toLocaleDateString();
      const time = new Date().toLocaleTimeString();
  
      let receiptText = `
         NEW AMBIKA SANDWICH
      --------------------------
      TOKEN NO: #${orderData.tokenNo}
      --------------------------
      DATE: ${date}   TIME: ${time}
      TYPE: ${orderData.type}
      --------------------------
      DESCRIPTION      QTY     PRICE
      --------------------------
      ${orderData.items.map(item => 
        `${item.name.substring(0,14).padEnd(14)} ${item.qty.toString().padEnd(4)} ${item.price * item.qty}`
      ).join('\n')}
      --------------------------
      TOTAL (CASH)             ${orderData.total}
      --------------------------
      EST. READY IN: 12 MINS
      --------------------------
        THANK YOU...VISIT AGAIN
      \n\n\n`; // Add extra lines for cutting paper
  
      // 3. Send to Printer
      await characteristic.writeValue(encoder.encode(receiptText));
      console.log("Printing successful!");
  
    } catch (error) {
      console.error("Printing failed:", error);
      alert("Printer Connection Failed. Check Bluetooth.");
    }
  };