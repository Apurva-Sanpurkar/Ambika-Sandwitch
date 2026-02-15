import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Download, Trash2, Clock, Zap, CheckCircle, X, MessageCircle, ArrowRight, User, Banknote, CreditCard, History, Search } from 'lucide-react';
import { toPng } from 'html-to-image';
import { Share } from '@capacitor/share'; // REQUIRED FOR APK
import { MENU_DATA } from '../../utils/menuData';
import { calculateWaitTime } from '../../utils/queueLogic';
import { db } from '../../services/firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, query, where, doc, runTransaction, orderBy, limit } from 'firebase/firestore';

const POSDashboard = () => {
  const [cart, setCart] = useState([]);
  const [activeQueueCount, setActiveQueueCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [availability, setAvailability] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('CASH'); 
  
  // History & Search States
  const [showHistory, setShowHistory] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState('');

  // Modal & Customer States
  const [showReceipt, setShowReceipt] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [recentCustomers, setRecentCustomers] = useState([]);
  const [lastOrder, setLastOrder] = useState(null);
  const receiptRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, "orders"), where("status", "==", "preparing"));
    const unsubQueue = onSnapshot(q, (snapshot) => {
      let count = 0;
      snapshot.forEach(doc => count += (doc.data().items?.length || 0));
      setActiveQueueCount(count);
    });

    const qHistory = query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(50));
    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      const pastOrders = [];
      snapshot.forEach(doc => pastOrders.push({ id: doc.id, ...doc.data() }));
      setOrderHistory(pastOrders);
    });

    const unsubMenu = onSnapshot(doc(db, "menu_status", "availability"), (docSnap) => {
      if (docSnap.exists()) setAvailability(docSnap.data());
    });

    const saved = JSON.parse(localStorage.getItem('recent_customers') || '[]');
    setRecentCustomers(saved);

    return () => { unsubQueue(); unsubHistory(); unsubMenu(); };
  }, []);

  const getNextTokenNumber = async () => {
    const counterRef = doc(db, "app_status", "token_counter");
    return await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists()) {
        transaction.set(counterRef, { lastToken: 1 });
        return 1;
      }
      const newCounter = counterDoc.data().lastToken + 1;
      transaction.update(counterRef, { lastToken: newCounter });
      return newCounter;
    });
  };

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
      const tokenNo = await getNextTokenNumber();
      const orderData = { 
        tokenNo, 
        items: cart, 
        total: totalPrice, 
        paymentMethod, 
        status: 'preparing', 
        timestamp: new Date() 
      };
      await addDoc(collection(db, "orders"), { ...orderData, timestamp: serverTimestamp() });
      setLastOrder(orderData);
      setCart([]);
      setShowPhoneModal(true);
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  // NATIVE ANDROID SHARE LOGIC
  const handleWhatsAppSend = async (phone, name = "") => {
    if (!phone || phone.length < 10) return;
    const displayName = name || "Customer";

    const updatedRecents = [{ phone, name: displayName }, ...recentCustomers.filter(c => c.phone !== phone)].slice(0, 5);
    setRecentCustomers(updatedRecents);
    localStorage.setItem('recent_customers', JSON.stringify(updatedRecents));

    const upiId = "yourname@upi"; // REPLACE WITH YOUR ACTUAL UPI ID
    const upiLink = `https://upilinks.in/pay/${upiId}/${lastOrder.total}`;

    let message = `*🥪 AMBIKA SANDWICH 🥪*\n*Hello ${displayName}!* 👋\n*TOKEN: #${lastOrder.tokenNo}*\nPay: ${lastOrder.paymentMethod}\nDate: ${formatDate(lastOrder.timestamp)}\n--------------------------------\n`;
    lastOrder.items.forEach((item, idx) => {
      message += `${idx + 1}. ${item.name} (${item.isParcel ? '📦 [P]' : '🍽️ [D]'})\n   Price: ₹${item.price}\n`;
    });
    message += `--------------------------------\n*TOTAL: ₹${lastOrder.total}*\n\n`;
    if (lastOrder.paymentMethod === 'UPI') message += `✅ *TAP TO PAY:* \n${upiLink}\n\n`;
    message += `⏳ *Ready in approx:* ${waitInfo.minutes} Mins`;

    try {
      await Share.share({
        title: 'Ambika Sandwich Bill',
        text: message,
        dialogTitle: 'Send Bill to Customer',
      });
    } catch (error) {
      console.error('Error sharing', error);
      // Fallback for web testing
      const finalNum = phone.startsWith('91') ? phone : `91${phone}`;
      window.open(`https://wa.me/${finalNum}?text=${encodeURIComponent(message)}`, '_blank');
    }

    setShowPhoneModal(false);
    setShowReceipt(true);
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = date instanceof Date ? date : date.toDate(); 
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  };

  // NATIVE ANDROID DOWNLOAD (SHARE) LOGIC
  const downloadPNG = async () => {
    if (!receiptRef.current) return;
    try {
      const dataUrl = await toPng(receiptRef.current, { backgroundColor: '#fff', pixelRatio: 2 });
      await Share.share({
        title: `Ambika-Token-${lastOrder.tokenNo}`,
        url: dataUrl,
      });
    } catch (error) {
      console.error("Download failed", error);
    }
  };

  const filteredHistory = orderHistory.filter(order => 
    order.tokenNo?.toString().includes(historySearch)
  );

  return (
    <div className="flex h-screen bg-[#FAFAFA] text-[#1A1A1A] overflow-hidden select-none relative font-sans">
      
      {/* 1. HISTORY SIDEBAR */}
      <AnimatePresence>
        {showHistory && (
          <motion.div initial={{ x: -400 }} animate={{ x: 0 }} exit={{ x: -400 }}
            className="fixed left-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-[150] flex flex-col p-8 border-r border-gray-100">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black italic uppercase tracking-tighter">Order <span className="text-[#FFC107]">History</span></h2>
              <button onClick={() => setShowHistory(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"><X size={20}/></button>
            </div>
            
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18}/>
              <input type="text" placeholder="Search Token #" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-3 pl-12 pr-4 font-black text-sm outline-none focus:border-[#FFC107] transition-all"/>
            </div>

            <div className="flex-grow overflow-y-auto space-y-4 pr-2">
              {filteredHistory.map((order) => (
                <div key={order.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-[#FFC107] transition-all">
                  <div className="flex justify-between items-start mb-2 text-left">
                    <span className="font-black text-lg">#{order.tokenNo}</span>
                    <span className={`text-[9px] font-black px-2 py-1 rounded-full ${order.paymentMethod === 'UPI' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{order.paymentMethod}</span>
                  </div>
                  <div className="text-[10px] font-bold text-gray-400 mb-3 uppercase text-left">{formatDate(order.timestamp)} • {order.items?.length} Items</div>
                  <button onClick={() => { setLastOrder(order); setShowReceipt(true); }} 
                    className="w-full bg-white border border-gray-200 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-[#FFC107] hover:border-[#FFC107] transition-all">View & Reprint</button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT: MENU SECTION */}
      <div className="w-2/3 h-full overflow-y-auto p-6 border-r border-gray-200 text-left">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none">AMBIKA <span className="text-[#FFC107]">SANDWICH</span></h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-1">Captain Terminal v1.8</p>
          </div>
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-2 bg-black text-white px-6 py-3 rounded-2xl font-black text-xs hover:bg-gray-800 transition-all shadow-lg active:scale-95">
            <History size={18}/> HISTORY
          </button>
        </header>

        {Object.entries(MENU_DATA).map(([cat, items]) => (
          <div key={cat} className="mb-10 text-left">
            <h2 className="text-xs font-black uppercase text-gray-400 mb-5 flex items-center gap-2 tracking-widest"><Zap size={14} className="text-[#FFC107]"/>{cat.replace('_',' ')}</h2>
            <div className="grid grid-cols-3 gap-4">
              {items.map(item => (
                <motion.button key={item.id} disabled={availability[item.id] === false} onClick={() => addToCart(item)}
                  className={`bg-white p-6 rounded-[2.5rem] border-b-6 flex flex-col items-start relative transition-all ${availability[item.id] === false ? 'opacity-40 grayscale border-gray-300 pointer-events-none' : 'border-[#FFC107] hover:shadow-xl'}`}>
                  <span className="font-black text-sm uppercase leading-tight pr-4 text-left">{item.name}</span>
                  <span className="mt-4 font-black text-lg text-[#2E7D32]">₹{item.price}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* RIGHT: BILLING SIDEBAR */}
      <div className="w-1/3 h-full bg-white flex flex-col shadow-2xl z-10 text-left">
        <div className="p-8 flex-grow overflow-y-auto">
          <h2 className="text-2xl font-black mb-8 italic flex items-center gap-3"><ShoppingCart strokeWidth={3}/> BILLING</h2>
          <AnimatePresence mode='popLayout'>
            {cart.map((item, i) => (
              <motion.div layout key={item.tempId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex justify-between items-center p-4 bg-gray-50 rounded-[1.8rem] mb-3 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <button onClick={() => setCart(prev => prev.map((it, idx) => idx === i ? {...it, isParcel: !it.isParcel} : it))}
                    className={`w-8 h-8 rounded-full border-2 font-black text-[10px] transition-all flex items-center justify-center ${item.isParcel ? 'bg-red-600 border-red-600 text-white shadow-md' : 'border-gray-200 text-gray-300'}`}>P</button>
                  <div className="flex flex-col text-left">
                    <span className="font-black text-[11px] uppercase">{item.name}</span>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Item #{i+1}</span>
                  </div>
                </div>
                <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500"><Trash2 size={16}/></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="p-8 bg-[#1A1A1A] text-white rounded-t-[3.5rem] shadow-2xl">
          <div className="flex bg-white/10 p-1 rounded-2xl mb-6">
            <button onClick={() => setPaymentMethod('CASH')} className={`flex-1 py-3 rounded-xl font-black text-[10px] flex items-center justify-center gap-2 transition-all ${paymentMethod === 'CASH' ? 'bg-white text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
              <Banknote size={14}/> CASH
            </button>
            <button onClick={() => setPaymentMethod('UPI')} className={`flex-1 py-3 rounded-xl font-black text-[10px] flex items-center justify-center gap-2 transition-all ${paymentMethod === 'UPI' ? 'bg-[#FFC107] text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
              <CreditCard size={14}/> UPI
            </button>
          </div>
          <div className="flex justify-between items-end mb-8 px-2 text-left"><div><span className="block text-[10px] font-black text-gray-500 uppercase mb-1">Grand Total</span><span className="text-5xl block font-black text-left">₹{totalPrice}</span></div></div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleCheckout} disabled={cart.length === 0 || isProcessing}
            className={`w-full py-6 rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-xl transition-all ${cart.length > 0 ? 'bg-[#FFC107] text-black' : 'bg-gray-800 text-gray-600'}`}>
            <CheckCircle size={24} strokeWidth={3}/> {isProcessing ? "PROCESSING..." : "CONFIRM ORDER"}
          </motion.button>
        </div>
      </div>

      {/* WHATSAPP MODAL */}
      <AnimatePresence>
        {showPhoneModal && (
          <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-md">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white rounded-[3rem] p-10 max-w-md w-full shadow-2xl text-left">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-3xl font-black italic tracking-tighter uppercase leading-none">WhatsApp <span className="text-[#25D366]">Bill</span></h2>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-2 text-left">Send Token to WhatsApp</p>
                </div>
                <button onClick={() => { setShowPhoneModal(false); setShowReceipt(true); }} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
              </div>
              <div className="space-y-4">
                <input type="text" placeholder="Customer Name (Optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-100 rounded-[1.8rem] py-5 px-8 font-black text-sm focus:border-[#FFC107] outline-none text-left" />
                <div className="relative text-left">
                  <input type="tel" placeholder="Phone Number" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-[1.8rem] py-5 px-8 font-black text-xl focus:border-[#25D366] outline-none" />
                  <button onClick={() => handleWhatsAppSend(customerPhone, customerName)} className="absolute right-3 top-3 bg-[#25D366] text-white p-3 rounded-2xl hover:scale-105 transition-transform"><ArrowRight size={24} strokeWidth={3}/></button>
                </div>
                {recentCustomers.length > 0 && (
                  <div className="mt-8 text-left">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-4 mb-3 block italic tracking-widest text-left">Recent Customers</label>
                    <div className="flex flex-wrap gap-2 text-left">
                      {recentCustomers.map((c, i) => (
                        <button key={i} onClick={() => handleWhatsAppSend(c.phone, c.name)} className="bg-gray-50 border border-gray-100 px-4 py-3 rounded-2xl text-[10px] font-black flex items-center gap-2 hover:bg-green-50 transition-all">
                          <User size={12}/> {c.name} ({c.phone})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DETAILED RECEIPT MODAL */}
      <AnimatePresence>
        {showReceipt && (
          <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full relative">
              <button onClick={() => setShowReceipt(false)} className="absolute -top-2 -right-2 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-all"><X size={20}/></button>
              <div id="digital-receipt" ref={receiptRef} className="bg-white p-6 border-2 border-dashed border-gray-300 font-mono text-black text-[10px] text-left">
                <div className="text-center mb-4 text-left">
                  <h3 className="font-black text-lg uppercase tracking-tighter leading-none text-center">Ambika Sandwich</h3>
                  <p className="font-bold text-gray-500 uppercase text-[8px] mt-1 italic tracking-widest text-center">Pune's Favorite Taste</p>
                </div>
                <div className="border-y border-black py-4 my-3 text-center">
                  <span className="block text-[8px] font-black uppercase text-gray-400 mb-1">Token Number</span>
                  <span className="font-black text-5xl italic tracking-widest">#{lastOrder?.tokenNo}</span>
                </div>
                <div className="flex justify-between font-bold border-b border-gray-100 pb-2 mb-3 text-[9px]">
                  <span>DATE: {formatDate(lastOrder?.timestamp)}</span>
                  <span>PAY: {lastOrder?.paymentMethod}</span>
                </div>
                <div className="space-y-2 mb-4 text-left">
                  {lastOrder?.items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-start uppercase font-bold text-[10px]">
                      <div className="flex gap-2 text-left">
                        {it.isParcel ? <span className="shrink-0 w-4 h-4 rounded-full border-2 border-red-600 text-red-600 text-[9px] flex items-center justify-center font-black mt-0.5 bg-white">P</span> : <div className="shrink-0 w-4" />}
                        <span className="leading-tight">1x {it.name}</span>
                      </div>
                      <span className="shrink-0 font-black">₹{it.price}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-black text-sm border-t border-black pt-2"><span>GRAND TOTAL</span><span>₹{lastOrder?.total}</span></div>
                <div className="mt-6 text-center border-t border-dashed border-gray-200 pt-4"><p className="text-xl font-black text-orange-500 uppercase tracking-tighter text-center">{waitInfo.minutes} MINS</p></div>
              </div>
              <button onClick={downloadPNG} className="w-full mt-6 bg-green-600 text-white py-4 rounded-[1.5rem] font-black flex items-center justify-center gap-3 hover:bg-green-700 shadow-xl active:scale-95 transition-all">
                <Download size={20}/> SHARE / DOWNLOAD
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default POSDashboard;