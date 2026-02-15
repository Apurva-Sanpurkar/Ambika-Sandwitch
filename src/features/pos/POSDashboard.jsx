import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Download, Trash2, Zap, CheckCircle, X, History, MessageCircle, Search } from 'lucide-react';
import { toPng } from 'html-to-image';
import { Share } from '@capacitor/share'; 
import { Filesystem, Directory } from '@capacitor/filesystem'; 
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
  const [showHistory, setShowHistory] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [showCartMobile, setShowCartMobile] = useState(false); 
  const receiptRef = useRef(null);

  const MY_REAL_UPI_ID = "apurvasanpurkar2010@okaxis"; 

  useEffect(() => {
    const qQueue = query(collection(db, "orders"), where("status", "==", "preparing"));
    const unsubQueue = onSnapshot(qQueue, (snap) => {
      let count = 0;
      snap.forEach(d => count += (d.data().items?.length || 0));
      setActiveQueueCount(count);
    });
    const qHistory = query(collection(db, "orders"), orderBy("timestamp", "desc"), limit(50));
    const unsubHistory = onSnapshot(qHistory, (snap) => {
      const past = [];
      snap.forEach(d => past.push({ id: d.id, ...d.data() }));
      setOrderHistory(past);
    });
    onSnapshot(doc(db, "menu_status", "availability"), (d) => d.exists() && setAvailability(d.data()));
    return () => { unsubQueue(); unsubHistory(); };
  }, []);

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
      const tokenNo = await runTransaction(db, async (transaction) => {
        const counterRef = doc(db, "app_status", "token_counter");
        const counterDoc = await transaction.get(counterRef);
        const next = counterDoc.exists() ? counterDoc.data().lastToken + 1 : 1;
        transaction.set(counterRef, { lastToken: next });
        return next;
      });

      const orderData = { tokenNo, items: cart, total: totalPrice, paymentMethod, status: 'preparing', timestamp: new Date() };
      await addDoc(collection(db, "orders"), { ...orderData, timestamp: serverTimestamp() });
      
      setLastOrder(orderData);
      setCart([]);
      setShowCartMobile(false);
      setShowReceipt(true); // Now opens the bill immediately
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  // ACTION: SHARE TO WHATSAPP (Combined Image + Text)
  const handleShareToWhatsApp = async () => {
    if (!receiptRef.current) return;
    try {
      const dataUrl = await toPng(receiptRef.current, { backgroundColor: '#fff', pixelRatio: 3, cacheBust: true });
      const fileName = `Ambika_Token_${lastOrder.tokenNo}.png`;
      const base64Data = dataUrl.split(',')[1];
      
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache
      });

      const upiLink = `upi://pay?pa=${MY_REAL_UPI_ID}&pn=Ambika%20Sandwich&am=${lastOrder.total}&cu=INR`;
      const message = `*🥪 AMBIKA SANDWICH #${lastOrder.tokenNo}*\nTotal: ₹${lastOrder.total}\nPay: ${lastOrder.paymentMethod}\n\n✅ *TAP TO PAY:* \n${upiLink}\n\n⏳ *Ready in approx:* ${waitInfo.minutes} Mins`;

      await Share.share({
        title: 'Ambika Bill',
        text: message,
        url: savedFile.uri,
        dialogTitle: 'Share to WhatsApp',
      });
    } catch (error) { console.error(error); }
  };

  // ACTION: DOWNLOAD PNG (Saved to Documents)
  const handleDownloadPNG = async () => {
    if (!receiptRef.current) return;
    try {
      const dataUrl = await toPng(receiptRef.current, { backgroundColor: '#fff', pixelRatio: 3 });
      const fileName = `Ambika_Receipt_${lastOrder.tokenNo}.png`;
      const base64Data = dataUrl.split(',')[1];

      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents
      });
      alert("Bill saved to your Documents folder!");
    } catch (error) { alert("Download failed. Check storage permissions."); }
  };

  const formatDate = (date) => {
    if (!date) return "";
    const d = date instanceof Date ? date : date.toDate(); 
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
  };

  const filteredHistory = orderHistory.filter(order => order.tokenNo?.toString().includes(historySearch));

  return (
    <div className="flex flex-col h-screen bg-[#F8F9FA] text-[#1A1A1A] overflow-hidden select-none font-sans">
      
      {/* 1. HEADER */}
      <header className="p-4 bg-white border-b flex justify-between items-center shadow-sm z-30">
        <div className="text-left">
          <h1 className="text-xl font-black italic uppercase leading-none">Ambika <span className="text-[#FFC107]">Sandwich</span></h1>
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1">Captain Mobile v3.0</p>
        </div>
        <button onClick={() => setShowHistory(true)} className="p-2.5 bg-black text-white rounded-xl active:scale-90 transition-transform">
          <History size={20}/>
        </button>
      </header>

      {/* 2. MENU CONTENT */}
      <main className="flex-grow overflow-y-auto p-4 pb-32">
        {Object.entries(MENU_DATA).map(([cat, items]) => (
          <div key={cat} className="mb-8 text-left">
            <h2 className="text-[10px] font-black uppercase text-gray-400 mb-4 tracking-[0.2em] flex items-center gap-2">
              <Zap size={12} className="text-[#FFC107]"/> {cat.replace('_',' ')}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {items.map(item => (
                <button key={item.id} disabled={availability[item.id] === false} onClick={() => addToCart(item)}
                  className={`bg-white p-4 rounded-[2rem] border-b-4 flex flex-col items-start relative transition-all active:scale-95 ${availability[item.id] === false ? 'opacity-30 border-gray-200 pointer-events-none' : 'border-[#FFC107] shadow-sm'}`}>
                  <span className="font-black text-[11px] uppercase text-left leading-tight h-8 overflow-hidden">{item.name}</span>
                  <span className="mt-2 font-black text-sm text-[#2E7D32]">₹{item.price}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </main>

      {/* 3. CART SUMMARY BAR */}
      <AnimatePresence>
        {cart.length > 0 && !showCartMobile && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            className="fixed bottom-6 left-4 right-4 bg-black text-white p-4 rounded-[2rem] shadow-2xl z-40 flex items-center justify-between border-t border-white/10">
            <div className="pl-2 text-left">
              <span className="text-[9px] text-gray-400 uppercase font-black block">Total bill</span>
              <span className="text-2xl font-black">₹{totalPrice}</span>
            </div>
            <button onClick={() => setShowCartMobile(true)} className="bg-[#FFC107] text-black px-6 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2">
               Review Cart <ShoppingCart size={16} strokeWidth={3}/>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. CART DRAWER */}
      <AnimatePresence>
        {showCartMobile && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
            className="fixed inset-0 bg-white z-[100] flex flex-col">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-2xl font-black italic uppercase text-left">Your <span className="text-[#FFC107]">Order</span></h2>
              <button onClick={() => setShowCartMobile(false)} className="p-3 bg-gray-100 rounded-full"><X/></button>
            </div>
            <div className="flex-grow overflow-y-auto p-6 space-y-3">
              {cart.map((item, i) => (
                <div key={item.tempId} className="flex justify-between items-center p-4 bg-gray-50 rounded-[1.8rem] border border-gray-100">
                  <div className="flex items-center gap-4 text-left">
                    <button onClick={() => setCart(prev => prev.map((it, idx) => idx === i ? {...it, isParcel: !it.isParcel} : it))}
                      className={`w-10 h-10 rounded-full border-2 font-black text-xs flex items-center justify-center ${item.isParcel ? 'bg-red-600 border-red-600 text-white shadow-md' : 'border-gray-200 text-gray-300'}`}>P</button>
                    <div className="flex flex-col">
                      <span className="font-black text-xs uppercase leading-none">{item.name}</span>
                      <span className="text-[10px] font-bold text-[#2E7D32] mt-1">₹{item.price}</span>
                    </div>
                  </div>
                  <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-gray-300 p-2"><Trash2 size={20}/></button>
                </div>
              ))}
            </div>
            <div className="p-8 bg-[#1A1A1A] text-white rounded-t-[3.5rem] shadow-2xl">
              <div className="flex bg-white/10 p-1 rounded-2xl mb-6">
                <button onClick={() => setPaymentMethod('CASH')} className={`flex-1 py-3 rounded-xl font-black text-[10px] ${paymentMethod === 'CASH' ? 'bg-white text-black shadow-lg' : 'text-gray-500'}`}>CASH</button>
                <button onClick={() => setPaymentMethod('UPI')} className={`flex-1 py-3 rounded-xl font-black text-[10px] ${paymentMethod === 'UPI' ? 'bg-[#FFC107] text-black shadow-lg' : 'text-gray-500'}`}>UPI</button>
              </div>
              <button onClick={handleCheckout} className="w-full py-5 bg-[#FFC107] text-black rounded-2xl font-black text-xl uppercase shadow-xl active:scale-95">
                Confirm Order
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. HISTORY MODAL */}
      <AnimatePresence>
        {showHistory && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            className="fixed inset-0 bg-white z-[150] flex flex-col p-6">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-left">Order <span className="text-[#FFC107]">History</span></h2>
              <button onClick={() => setShowHistory(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            </div>
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18}/>
              <input type="text" placeholder="Search Token #" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl py-4 pl-12 pr-4 font-black text-sm outline-none focus:border-[#FFC107]"/>
            </div>
            <div className="flex-grow overflow-y-auto space-y-4 pr-2">
              {filteredHistory.map((order) => (
                <div key={order.id} className="p-5 bg-gray-50 rounded-2xl border flex justify-between items-center">
                  <div className="text-left">
                    <span className="font-black text-xl block">#{order.tokenNo}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{formatDate(order.timestamp)} • ₹{order.total}</span>
                  </div>
                  <button onClick={() => { setLastOrder(order); setShowReceipt(true); }} className="bg-white px-4 py-2 rounded-xl text-[10px] font-black uppercase border-2 border-black active:bg-black active:text-white">View</button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. FINAL BILL MODAL WITH SHARE & DOWNLOAD */}
      <AnimatePresence>
        {showReceipt && (
          <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-6 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-xs relative">
              
              {/* THE RECEIPT (Ref for PNG generation) */}
              <div ref={receiptRef} className="bg-white p-6 rounded-t-[2.5rem] border-b-4 border-dashed border-gray-100 font-mono text-black text-[10px] text-left">
                <div className="text-center mb-4">
                  <h3 className="font-black text-lg uppercase italic tracking-tighter">Ambika Sandwich</h3>
                  <p className="text-[8px] font-bold text-gray-400 uppercase mt-1">Fresh & Tasty Since 1998</p>
                </div>
                <div className="border-y-2 border-black py-4 my-3 text-center">
                  <span className="block text-[8px] font-black uppercase text-gray-400">Token Number</span>
                  <span className="font-black text-5xl italic tracking-tighter">#{lastOrder?.tokenNo}</span>
                </div>
                <div className="space-y-2 mb-4">
                  {lastOrder?.items?.map((it, idx) => (
                    <div key={idx} className="flex justify-between uppercase font-bold text-[9px]">
                      <span>{it.isParcel ? '📦' : '🍽️'} 1x {it.name.substring(0,18)}</span>
                      <span>₹{it.price}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-black text-sm border-t-2 border-black pt-3 uppercase"><span>TOTAL</span><span>₹{lastOrder?.total}</span></div>
                <div className="mt-6 text-center text-[7px] text-gray-400 font-bold uppercase tracking-widest">Thank You • Visit Again</div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="bg-[#1A1A1A] p-4 rounded-b-[2.5rem] space-y-3 shadow-2xl">
                <button onClick={handleShareToWhatsApp} className="w-full bg-[#25D366] text-white py-4 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-3 active:scale-95 transition-all">
                  <MessageCircle size={18} strokeWidth={3}/> Share to WhatsApp
                </button>
                <div className="flex gap-3">
                  <button onClick={handleDownloadPNG} className="flex-1 bg-white/10 text-white py-4 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2 active:scale-95">
                    <Download size={14}/> Save PNG
                  </button>
                  <button onClick={() => setShowReceipt(false)} className="flex-1 bg-red-500/20 text-red-500 py-4 rounded-xl font-black text-[10px] uppercase active:scale-95">Close</button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default POSDashboard;