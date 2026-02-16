import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingCart, Download, Trash2, Zap, CheckCircle, 
  X, MessageCircle, ArrowRight, User, Banknote, CreditCard, 
  History, Search, Phone, Star, ChefHat, Package, FileText, TrendingUp, Clock, Printer
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { Share } from '@capacitor/share'; 
import { Filesystem, Directory } from '@capacitor/filesystem';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; 

import { MENU_DATA } from '../../utils/menuData';
import { calculateWaitTime } from '../../utils/queueLogic';
import { db } from '../../services/firebase';
import { 
  collection, addDoc, serverTimestamp, onSnapshot, query, 
  where, doc, runTransaction, orderBy, limit 
} from 'firebase/firestore';

const POSDashboard = () => {
  // --- STATE MANAGEMENT ---
  const [cart, setCart] = useState([]);
  const [activeQueueCount, setActiveQueueCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [availability, setAvailability] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [showHistory, setShowHistory] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [recentCustomers, setRecentCustomers] = useState([]);
  const [lastOrder, setLastOrder] = useState(null);
  const [showCartMobile, setShowCartMobile] = useState(false); 
  const receiptRef = useRef(null);

  const MY_REAL_UPI_ID = "apurvasanpurkar2010@okaxis"; 

  // --- FIREBASE & LOCAL STORAGE SYNC ---
  useEffect(() => {
    const qQueue = query(collection(db, "orders"), where("status", "==", "preparing"));
    const unsubQueue = onSnapshot(qQueue, (snap) => {
      let count = 0;
      snap.forEach(d => count += (d.data().items?.length || 0));
      setActiveQueueCount(count);
    });

    const qHistory = query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(100));
    const unsubHistory = onSnapshot(qHistory, (snap) => {
      const past = [];
      snap.forEach(d => past.push({ id: d.id, ...d.data() }));
      setOrderHistory(past);
    });

    onSnapshot(doc(db, "menu_status", "availability"), (d) => d.exists() && setAvailability(d.data()));
    
    const saved = JSON.parse(localStorage.getItem('recent_customers') || '[]');
    setRecentCustomers(saved);

    return () => { unsubQueue(); unsubHistory(); };
  }, []);

  // --- ANALYTICS CALCULATIONS ---
  const stats = useMemo(() => {
    const now = new Date();
    return orderHistory.reduce((acc, order) => {
      const d = order.timestamp?.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      const isToday = d.toDateString() === now.toDateString();
      const isThisMonth = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();

      if (isToday) { acc.todaySales += (order.total || 0); acc.todayOrders += 1; }
      if (isThisMonth) { acc.monthSales += (order.total || 0); acc.monthOrders += 1; }
      return acc;
    }, { todaySales: 0, todayOrders: 0, monthSales: 0, monthOrders: 0 });
  }, [orderHistory]);

  // --- PDF REPORT GENERATION ---
// Import the function directly
  
  const generateSalesPDF = async (type) => {
    console.log("Starting Production PDF Flow for:", type);
    
    try {
      const doc = new jsPDF();
      const now = new Date();
      
      // 1. Setup PDF Content
      doc.setFontSize(22);
      doc.text("AMBIKA SANDWICH", 14, 20);
      doc.setFontSize(10);
      doc.text(`${type.toUpperCase()} SALES REPORT | ${now.toLocaleDateString()}`, 14, 28);
  
      const filtered = orderHistory.filter(o => {
        const d = o.timestamp?.toDate ? o.timestamp.toDate() : new Date(o.timestamp);
        return type === 'day' 
          ? d.toDateString() === now.toDateString() 
          : d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
  
      const body = filtered.map((o, i) => [
        i + 1,
        `#${o.tokenNo}`,
        o.paymentMethod || 'CASH',
        `Rs. ${o.total}`
      ]);
  
      // 2. THE FIX: Call autoTable as a standalone function passing the doc
      autoTable(doc, {
        startY: 35,
        head: [['Sr.', 'Token', 'Method', 'Amount']],
        body: body,
        theme: 'striped',
        headStyles: { fillColor: [255, 193, 7], textColor: 0 },
        foot: [['', '', 'TOTAL REVENUE', `Rs. ${filtered.reduce((a, b) => a + (b.total || 0), 0)}`]],
        footStyles: { fillColor: [0, 0, 0] }
      });
  
      // 3. Convert to Base64 and STRIP the header
      const pdfDataUri = doc.output('datauristring');
      const rawBase64 = pdfDataUri.split(',')[1]; 
  
      const fileName = `Ambika_${type}_${Date.now()}.pdf`;
  
      // 4. Write to Native Cache
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: rawBase64,
        directory: Directory.Cache,
        recursive: true
      });
  
      // 5. Trigger Native Share Sheet
      await Share.share({
        title: 'Ambika Sales Report',
        url: savedFile.uri
      });
  
    } catch (error) {
      console.error("PDF PRODUCTION ERROR:", error);
      alert("System Error: " + error.message);
    }
  };
  // --- POS BUSINESS ACTIONS ---
  const addToCart = (item) => {
    if (availability[item.id] === false) return;
    setCart((prev) => [...prev, { ...item, qty: 1, isParcel: false, tempId: Date.now() + Math.random() }]);
  };

  const totalPrice = cart.reduce((acc, item) => acc + item.price, 0);
  const waitInfo = useMemo(() => calculateWaitTime(activeQueueCount), [activeQueueCount]);

  const handleCheckout = async () => {
    if (cart.length === 0 || isProcessing) return;
    setIsProcessing(true);
    try {
      const tokenNo = await runTransaction(db, async (t) => {
        const cRef = doc(db, "app_status", "token_counter");
        const cDoc = await t.get(cRef);
        const next = cDoc.exists() ? cDoc.data().lastToken + 1 : 1;
        t.set(cRef, { lastToken: next });
        return next;
      });
      const orderData = { tokenNo, items: cart, total: totalPrice, paymentMethod, status: 'preparing', timestamp: new Date() };
      await addDoc(collection(db, "orders"), { ...orderData, timestamp: serverTimestamp() });
      setLastOrder(orderData); setCart([]); setShowCartMobile(false); setShowPhoneModal(true);
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const handleProfessionalShare = async () => {
    if (!receiptRef.current) return;
    try {
      const dataUrl = await toPng(receiptRef.current, { backgroundColor: '#fff', pixelRatio: 3, cacheBust: true });
      const base64Data = dataUrl.split(',')[1];
      const fileName = `Bill_${lastOrder.tokenNo}.png`;

      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });

      const upiLink = `upi://pay?pa=${MY_REAL_UPI_ID}&pn=Ambika%20Sandwich&am=${lastOrder.total}&cu=INR`;
      
      // We put the phone number in the title/text so it appears in the share sheet
      const itemsList = lastOrder.items
      .map((it, idx) => `${idx + 1}. ${it.name} ${it.isParcel ? '📦' : '🍽️'} - ₹${it.price}`)
      .join('\n');
    
    const caption = 
      `*🥪 AMBIKA SANDWICH * 🥪\n` +
      `--------------------------------------------\n` +
      `*BILLING DETAILS*\n` +
      `--------------------------------------------\n` +
      `*Token:* #${lastOrder.tokenNo}\n` +
      `*Customer:* ${customerName || 'Valued Guest'}\n` +
      `*Date:* ${new Date().toLocaleDateString()}\n` +
      `--------------------------------------------\n` +
      `*ITEMS ORDERED:*\n` +
      `${itemsList}\n` +
      `--------------------------------------------\n` +
      `*GRAND TOTAL: ₹${lastOrder.total}*\n` +
      `--------------------------------------------\n\n` +
      `✅ *TAP TO PAY VIA UPI:*\n${upiLink}\n\n` +
      `✨ _Thank you for your order!_\n` +
      `🚀 _Your sandwich is being prepared with care._`;

      // NATIVE BUNDLE: This sends Image + Text as one package
      await Share.share({
        title: `Bill for ${customerName || customerPhone}`,
        text: caption,      // THIS IS THE CAPTION
        url: savedFile.uri,  // THIS IS THE IMAGE
        dialogTitle: 'Send to Customer'
      });

      if (customerPhone) {
        const updated = [{ phone: customerPhone, name: customerName || 'Customer' }, ...recentCustomers.filter(c => c.phone !== customerPhone)].slice(0, 5);
        setRecentCustomers(updated); 
        localStorage.setItem('recent_customers', JSON.stringify(updated));
      }
    } catch (error) { console.error(error); }
  };

  const handleDownloadPNG = async () => {
    if (!receiptRef.current) return;
    try {
      const dataUrl = await toPng(receiptRef.current, { backgroundColor: '#fff', pixelRatio: 3 });
      await Filesystem.writeFile({
        path: `Ambika_Receipt_${lastOrder.tokenNo}.png`,
        data: dataUrl.split(',')[1],
        directory: Directory.Documents
      });
      alert("Bill saved to Documents!");
    } catch (error) { alert("Download failed."); }
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = date instanceof Date ? date : date.toDate(); 
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };

  const filteredHistory = orderHistory.filter(o => o.tokenNo?.toString().includes(historySearch));

  return (
    <div className="flex flex-col h-screen bg-[#F8F9FA] text-[#1A1A1A] overflow-hidden select-none font-sans">
      
      {/* 1. HEADER */}
      <header className="p-4 bg-white border-b flex justify-between items-center shadow-sm z-30">
        <div className="text-left">
          <h1 className="text-xl font-black italic uppercase leading-none">Ambika <span className="text-[#FFC107]">Sandwich</span></h1>
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1">Captain Mobile v4.5</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdmin(true)} className="p-2.5 bg-[#FFC107] text-black rounded-xl active:scale-90"><ChefHat size={20}/></button>
          <button onClick={() => setShowHistory(true)} className="p-2.5 bg-black text-white rounded-xl active:scale-90"><History size={20}/></button>
        </div>
      </header>

      {/* 2. MENU GRID */}
      <main className="flex-grow overflow-y-auto p-4 pb-32">
        {Object.entries(MENU_DATA).map(([cat, items]) => (
          <div key={cat} className="mb-8 text-left">
            <h2 className="text-[10px] font-black uppercase text-gray-400 mb-4 flex items-center gap-2"><Zap size={12} className="text-[#FFC107]"/> {cat.replace('_',' ')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {items.map(item => (
                <button key={item.id} disabled={availability[item.id] === false} onClick={() => addToCart(item)}
                  className={`bg-white p-4 rounded-[2rem] border-b-4 flex flex-col items-start active:scale-95 ${availability[item.id] === false ? 'opacity-30' : 'border-[#FFC107]'}`}>
                  <span className="font-black text-[11px] uppercase text-left leading-tight h-8 overflow-hidden">{item.name}</span>
                  <span className="mt-2 font-black text-sm text-[#2E7D32]">₹{item.price}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </main>

      {/* 3. CART BOTTOM SUMMARY */}
      <AnimatePresence>
        {cart.length > 0 && !showCartMobile && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="fixed bottom-6 left-4 right-4 bg-black text-white p-4 rounded-[2rem] shadow-2xl z-40 flex items-center justify-between border-t border-white/10">
            <div className="pl-2 text-left"><span className="text-[9px] text-gray-400 uppercase font-black block">Total Bill</span><span className="text-2xl font-black italic">₹{totalPrice}</span></div>
            <button onClick={() => setShowCartMobile(true)} className="bg-[#FFC107] text-black px-6 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2">Order <ShoppingCart size={16}/></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. CART DRAWER */}
      <AnimatePresence>
        {showCartMobile && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }} className="fixed inset-0 bg-white z-[100] flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-[#F8F9FA]">
              <h2 className="text-2xl font-black italic uppercase text-left">Your <span className="text-[#FFC107]">Basket</span></h2>
              <button onClick={() => setShowCartMobile(false)} className="p-3 bg-gray-100 rounded-full"><X/></button>
            </div>
            <div className="flex-grow overflow-y-auto p-6 space-y-3">
              {cart.map((item, i) => (
                <div key={item.tempId} className="flex justify-between items-center p-4 bg-gray-50 rounded-[1.8rem] border text-left">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setCart(prev => prev.map((it, idx) => idx === i ? {...it, isParcel: !it.isParcel} : it))}
                      className={`w-10 h-10 rounded-full border-2 font-black text-xs flex items-center justify-center ${item.isParcel ? 'bg-red-600 border-red-600 text-white shadow-md' : 'border-gray-200 text-gray-300'}`}>P</button>
                    <div className="flex flex-col"><span className="font-black text-xs uppercase">{item.name}</span><span className="text-[10px] font-bold text-[#2E7D32]">₹{item.price}</span></div>
                  </div>
                  <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-gray-300"><Trash2 size={20}/></button>
                </div>
              ))}
            </div>
            <div className="p-8 bg-[#1A1A1A] text-white rounded-t-[3.5rem] shadow-2xl">
              <div className="flex bg-white/10 p-1 rounded-2xl mb-6">
                <button onClick={() => setPaymentMethod('CASH')} className={`flex-1 py-3 rounded-xl font-black text-[10px] ${paymentMethod === 'CASH' ? 'bg-white text-black' : 'text-gray-500'}`}>CASH</button>
                <button onClick={() => setPaymentMethod('UPI')} className={`flex-1 py-3 rounded-xl font-black text-[10px] ${paymentMethod === 'UPI' ? 'bg-[#FFC107] text-black' : 'text-gray-500'}`}>UPI</button>
              </div>
              <div className="flex justify-between items-end mb-6 px-2 text-left">
                <div><span className="block text-[10px] font-black text-gray-500 uppercase">Grand Total</span><span className="text-4xl block font-black">₹{totalPrice}</span></div>
                <div className="text-right"><span className="text-[9px] font-black text-orange-400 block uppercase">Wait</span><span className="text-xl font-black">{waitInfo.minutes}m</span></div>
              </div>
              <button onClick={handleCheckout} className="w-full py-5 bg-[#FFC107] text-black rounded-2xl font-black text-xl uppercase shadow-xl active:scale-95">CONFIRM ORDER</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. CUSTOMER MODAL */}
      <AnimatePresence>
        {showPhoneModal && (
          <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-6 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-[2.5rem] p-8 w-full shadow-2xl text-left border border-white/20">
              <h2 className="text-2xl font-black uppercase italic mb-6 leading-tight tracking-tighter">Customer <span className="text-[#25D366]">Details</span></h2>
              <div className="space-y-4">
                <input type="text" placeholder="Full Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 px-6 font-black text-sm focus:border-[#FFC107] outline-none text-left" />
                <div className="relative text-left">
                  <input type="tel" placeholder="Phone Number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 px-6 font-black text-xl focus:border-[#25D366] outline-none tracking-widest" />
                  <button onClick={() => { setShowPhoneModal(false); setShowReceipt(true); }} className="absolute right-2 top-2 bg-[#25D366] text-white p-3 rounded-xl shadow-lg active:scale-90"><ArrowRight size={20} strokeWidth={3}/></button>
                </div>
                <div className="flex flex-wrap gap-2 mt-4 text-left">
                  {recentCustomers.map((c, i) => (
                    <button key={i} onClick={() => { setCustomerName(c.name); setCustomerPhone(c.phone); }} className="bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl text-[9px] font-black flex items-center gap-2 active:bg-green-50"><Star size={10} className="text-[#FFC107] fill-[#FFC107]"/> {c.name}</button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. RECEIPT MODAL */}
      <AnimatePresence>
        {showReceipt && (
          <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-6 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-xs relative">
              <button onClick={() => setShowReceipt(false)} className="absolute -top-2 -right-2 bg-red-500 text-white p-2 rounded-full shadow-lg z-50"><X size={18}/></button>
              <div ref={receiptRef} className="bg-white p-8 rounded-t-[2.5rem] border-b-4 border-dashed border-gray-100 font-mono text-black text-[10px] text-left">
                <div className="text-center mb-6">
                  <ChefHat className="mx-auto mb-2" size={32}/>
                  <h3 className="font-black text-xl uppercase italic tracking-tighter text-center">Ambika Sandwich</h3>
                  <p className="text-[7px] font-bold text-gray-400 uppercase mt-1 text-center">Fresh & Tasty Since 1998</p>
                </div>
                <div className="border-y-2 border-black py-4 my-4 text-center">
                  <span className="block text-[8px] font-black uppercase text-gray-400">Token Number</span>
                  <span className="font-black text-5xl italic tracking-tighter">#{lastOrder?.tokenNo}</span>
                </div>
                <div className="space-y-2 mb-6 uppercase font-bold text-[9px]">
                  {lastOrder?.items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between uppercase text-left"><span>{it.isParcel ? '📦' : '🍽️'} 1x {it.name.substring(0,18)}</span><span className="font-black">₹{it.price}</span></div>
                  ))}
                </div>
                <div className="flex justify-between font-black text-base border-t-2 border-black pt-4 uppercase text-left"><span>Amount</span><span>₹{lastOrder?.total}</span></div>
                <div className="mt-8 text-center text-[7px] text-gray-400 font-black uppercase tracking-widest text-center italic">Thank You • Visit Again</div>
              </div>
              <div className="bg-[#1A1A1A] p-4 rounded-b-[2.5rem] space-y-3 shadow-2xl">
                <button onClick={handleProfessionalShare} className="w-full bg-[#25D366] text-white py-4 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-3 active:scale-95 shadow-lg border-b-4 border-green-800"><MessageCircle size={18} strokeWidth={3}/> Share to WhatsApp</button>
                <button onClick={handleDownloadPNG} className="w-full bg-white/10 text-white py-4 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2 active:scale-95 border border-white/5"><Download size={14}/> Download PNG</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. ADMIN DASHBOARD */}
      <AnimatePresence>
        {showAdmin && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed inset-0 bg-white z-[200] flex flex-col p-6">
            <div className="flex justify-between items-center mb-8 text-left"><h2 className="text-2xl font-black italic uppercase text-left">Admin <span className="text-[#FFC107]">Dashboard</span></h2><button onClick={() => setShowAdmin(false)} className="p-2 bg-gray-100 rounded-full active:bg-gray-200"><X/></button></div>
            <div className="grid grid-cols-2 gap-4 mb-8 text-left">
              <div className="bg-gray-50 p-6 rounded-[2.5rem] border-b-4 border-black text-left shadow-sm">
                <span className="text-[9px] font-black uppercase text-gray-400">Today's Sales</span>
                <div className="text-2xl font-black mt-1">₹{stats.todaySales}</div>
                <span className="text-[8px] font-bold text-green-600 uppercase">{stats.todayOrders} Orders</span>
              </div>
              <div className="bg-gray-50 p-6 rounded-[2.5rem] border-b-4 border-[#FFC107] text-left shadow-sm">
                <span className="text-[9px] font-black uppercase text-gray-400">Month Total</span>
                <div className="text-2xl font-black mt-1">₹{stats.monthSales}</div>
                <span className="text-[8px] font-bold text-blue-600 uppercase">{stats.monthOrders} Orders</span>
              </div>
            </div>
            <div className="space-y-4">
              <button onClick={() => generateSalesPDF('day')} className="w-full py-5 bg-black text-white rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-3 active:scale-95 shadow-xl"><FileText size={18}/> Daily PDF Report</button>
              <button onClick={() => generateSalesPDF('month')} className="w-full py-5 border-4 border-black font-black text-xs uppercase flex items-center justify-center gap-3 active:scale-95"><TrendingUp size={18}/> Monthly PDF Report</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 8. HISTORY SIDEBAR */}
      <AnimatePresence>
        {showHistory && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed inset-0 bg-white z-[150] flex flex-col p-6 text-left">
            <div className="flex justify-between items-center mb-8"><h2 className="text-2xl font-black italic uppercase tracking-tighter text-left leading-none">Order <span className="text-[#FFC107]">History</span></h2><button onClick={() => setShowHistory(false)} className="p-2 bg-gray-100 rounded-full active:bg-gray-200 transition-all"><X size={20}/></button></div>
            <div className="relative mb-6 text-left"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18}/><input type="text" placeholder="Search Token #" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 pl-12 pr-4 font-black text-sm outline-none focus:border-[#FFC107] shadow-sm transition-all text-left"/></div>
            <div className="flex-grow overflow-y-auto space-y-4">{filteredHistory.map((o) => (<div key={o.id} className="p-5 bg-gray-50 rounded-2xl border flex justify-between items-center text-left shadow-sm"><div className="text-left leading-none"><span className="font-black text-xl block text-left">#{o.tokenNo}</span><span className="text-[10px] font-bold text-gray-400 uppercase text-left">{formatDate(o.timestamp)} • ₹{o.total}</span></div><button onClick={() => { setLastOrder(o); setShowReceipt(true); }} className="bg-white px-5 py-2 rounded-xl text-[10px] font-black uppercase border-2 border-black active:bg-black active:text-white transition-all shadow-sm">View</button></div>))}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default POSDashboard;