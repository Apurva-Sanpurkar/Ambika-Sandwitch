import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingCart, Download, Trash2, Zap, CheckCircle, 
  X, MessageCircle, ArrowRight, User, Banknote, CreditCard, 
  History, Search, Phone, Star, ChefHat, Package, FileText, TrendingUp
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { Share } from '@capacitor/share'; 
import { Filesystem, Directory } from '@capacitor/filesystem';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { MENU_DATA } from '../../utils/menuData';
import { calculateWaitTime } from '../../utils/queueLogic';
import { db } from '../../services/firebase';
import { 
  collection, addDoc, serverTimestamp, onSnapshot, query, 
  where, doc, runTransaction, orderBy, limit 
} from 'firebase/firestore';

const POSDashboard = () => {
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

  const generateSalesPDF = async (type) => {
    const doc = new jsPDF();
    const now = new Date();
    const title = type === 'day' ? `Daily Sales: ${now.toDateString()}` : `Monthly Sales: ${now.toLocaleString('default', { month: 'long' })}`;
    
    doc.setFontSize(22); doc.text("AMBIKA SANDWICH", 14, 20);
    doc.setFontSize(12); doc.text(title, 14, 30);

    const filtered = orderHistory.filter(o => {
      const d = o.timestamp?.toDate ? o.timestamp.toDate() : new Date(o.timestamp);
      return type === 'day' ? d.toDateString() === now.toDateString() : d.getMonth() === now.getMonth();
    });

    const body = filtered.map(o => [`#${o.tokenNo}`, o.paymentMethod, `Rs.${o.total}`]);
    doc.autoTable({ startY: 40, head: [['Token', 'Payment', 'Amount']], body });
    
    const total = filtered.reduce((a, b) => a + (b.total || 0), 0);
    doc.text(`GRAND TOTAL: Rs.${total}`, 14, doc.lastAutoTable.finalY + 10);

    const pdfBase64 = doc.output('datauristring').split(',')[1];
    try {
      const file = await Filesystem.writeFile({
        path: `Ambika_Report_${Date.now()}.pdf`,
        data: pdfBase64,
        directory: Directory.Documents
      });
      await Share.share({ title: 'Sales Report', url: file.uri });
    } catch (e) { alert("PDF Save Failed"); }
  };

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
      const orderData = { tokenNo, items: cart, total: cart.reduce((a,b)=>a+b.price,0), paymentMethod, status: 'preparing' };
      await addDoc(collection(db, "orders"), { ...orderData, timestamp: serverTimestamp() });
      setLastOrder(orderData); setCart([]); setShowCartMobile(false); setShowPhoneModal(true);
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const handleProfessionalShare = async () => {
    if (!receiptRef.current) return;
    try {
      const dataUrl = await toPng(receiptRef.current, { backgroundColor: '#fff', pixelRatio: 3 });
      const savedFile = await Filesystem.writeFile({
        path: `Ambika_${lastOrder.tokenNo}.png`,
        data: dataUrl.split(',')[1],
        directory: Directory.Cache
      });
      const upiLink = `upi://pay?pa=${MY_REAL_UPI_ID}&pn=Ambika%20Sandwich&am=${lastOrder.total}&cu=INR`;
      const message = `*🥪 AMBIKA SANDWICH #${lastOrder.tokenNo}*\nHello ${customerName || 'Customer'}!\nTotal: ₹${lastOrder.total}\n✅ *TAP TO PAY:* \n${upiLink}`;

      if (customerPhone && customerPhone.length >= 10) {
        const cleanPhone = customerPhone.startsWith('91') ? customerPhone : `91${customerPhone}`;
        await Share.share({ title: 'Bill', url: savedFile.uri });
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
      } else {
        await Share.share({ title: 'Bill', text: message, url: savedFile.uri });
      }
      if (customerPhone) {
        const updated = [{ phone: customerPhone, name: customerName }, ...recentCustomers.filter(c => c.phone !== customerPhone)].slice(0, 5);
        setRecentCustomers(updated); localStorage.setItem('recent_customers', JSON.stringify(updated));
      }
    } catch (e) { console.error(e); }
  };

  const addToCart = (item) => availability[item.id] !== false && setCart([...cart, { ...item, tempId: Date.now()+Math.random() }]);

  return (
    <div className="flex flex-col h-screen bg-[#F8F9FA] text-[#1A1A1A] overflow-hidden select-none font-sans">
      <header className="p-4 bg-white border-b flex justify-between items-center shadow-sm z-30">
        <div className="text-left">
          <h1 className="text-xl font-black italic uppercase leading-none">Ambika <span className="text-[#FFC107]">Sandwich</span></h1>
          <p className="text-[8px] font-bold text-gray-400 uppercase mt-1">Terminal v4.0</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdmin(true)} className="p-2.5 bg-[#FFC107] text-black rounded-xl"><ChefHat size={20}/></button>
          <button onClick={() => setShowHistory(true)} className="p-2.5 bg-black text-white rounded-xl"><History size={20}/></button>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto p-4 pb-32">
        {Object.entries(MENU_DATA).map(([cat, items]) => (
          <div key={cat} className="mb-8 text-left">
            <h2 className="text-[10px] font-black uppercase text-gray-400 mb-4 flex items-center gap-2"><Zap size={12} className="text-[#FFC107]"/> {cat.replace('_',' ')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {items.map(item => (
                <button key={item.id} disabled={availability[item.id] === false} onClick={() => addToCart(item)} className={`bg-white p-4 rounded-[2rem] border-b-4 flex flex-col active:scale-95 ${availability[item.id] === false ? 'opacity-30' : 'border-[#FFC107]'}`}>
                  <span className="font-black text-[11px] uppercase text-left h-8 overflow-hidden">{item.name}</span>
                  <span className="mt-2 font-black text-sm text-[#2E7D32]">₹{item.price}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </main>

      {/* ADMIN DRAWER */}
      <AnimatePresence>
        {showAdmin && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="fixed inset-0 bg-white z-[200] flex flex-col p-6">
            <div className="flex justify-between items-center mb-8 text-left">
              <h2 className="text-2xl font-black italic uppercase text-left">Admin <span className="text-[#FFC107]">Panel</span></h2>
              <button onClick={() => setShowAdmin(false)} className="p-3 bg-gray-100 rounded-full"><X/></button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-8 text-left">
              <div className="bg-gray-50 p-6 rounded-[2.5rem] border-b-4 border-black text-left">
                <span className="text-[9px] font-black text-gray-400 uppercase">Today</span>
                <div className="text-2xl font-black">₹{stats.todaySales}</div>
              </div>
              <div className="bg-gray-50 p-6 rounded-[2.5rem] border-b-4 border-[#FFC107] text-left">
                <span className="text-[9px] font-black text-gray-400 uppercase">Month</span>
                <div className="text-2xl font-black">₹{stats.monthSales}</div>
              </div>
            </div>
            <button onClick={() => generateSalesPDF('day')} className="w-full py-5 bg-black text-white rounded-2xl font-black text-xs uppercase mb-3 flex items-center justify-center gap-3"><FileText size={18}/> Day Sales PDF</button>
            <button onClick={() => generateSalesPDF('month')} className="w-full py-5 border-4 border-black font-black text-xs uppercase flex items-center justify-center gap-3"><TrendingUp size={18}/> Month Sales PDF</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RECEIPT MODAL */}
      <AnimatePresence>
        {showReceipt && (
          <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-xs">
              <button onClick={() => setShowReceipt(false)} className="absolute -top-2 -right-2 bg-red-500 text-white p-2 rounded-full z-50"><X size={18}/></button>
              <div ref={receiptRef} className="bg-white p-8 rounded-t-[2.5rem] border-b-4 border-dashed border-gray-100 font-mono text-[10px] text-left">
                <ChefHat className="mx-auto mb-2" size={30}/><h3 className="font-black text-center uppercase">Ambika Sandwich</h3>
                <div className="border-y-2 border-black py-4 my-4 text-center"><span className="text-[40px] font-black">#{lastOrder?.tokenNo}</span></div>
                <div className="space-y-1 mb-4">
                  {lastOrder?.items?.map((it, i) => (
                    <div key={i} className="flex justify-between uppercase"><span>1x {it.name.substring(0,15)}</span><span>₹{it.price}</span></div>
                  ))}
                </div>
                <div className="flex justify-between font-black text-sm border-t-2 border-black pt-2 uppercase"><span>Total</span><span>₹{lastOrder?.total}</span></div>
              </div>
              <div className="bg-[#1A1A1A] p-4 rounded-b-[2.5rem] space-y-2">
                <button onClick={handleProfessionalShare} className="w-full bg-[#25D366] text-white py-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 uppercase"><MessageCircle size={18}/> Send WhatsApp</button>
                <button onClick={() => { receiptRef.current && toPng(receiptRef.current).then(u => Filesystem.writeFile({ path: `Bill_${Date.now()}.png`, data: u.split(',')[1], directory: Directory.Documents }).then(()=>alert("Saved"))) }} className="w-full bg-white/10 text-white py-3 rounded-xl text-[10px] font-black uppercase">Save PNG</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CUSTOMER MODAL */}
      <AnimatePresence>
        {showPhoneModal && (
          <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-[2.5rem] p-8 w-full text-left">
              <h2 className="text-xl font-black uppercase mb-6">Customer <span className="text-[#25D366]">Details</span></h2>
              <input type="text" placeholder="Name" value={customerName} onChange={e=>setCustomerName(e.target.value)} className="w-full bg-gray-50 border-2 rounded-2xl py-4 px-6 mb-4 font-black text-sm focus:border-[#FFC107] outline-none text-left"/>
              <div className="relative">
                <input type="tel" placeholder="98XXXXXXXX" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} className="w-full bg-gray-50 border-2 rounded-2xl py-4 px-6 mb-6 font-black text-xl focus:border-[#25D366] outline-none text-left"/>
                <button onClick={()=>{setShowPhoneModal(false); setShowReceipt(true)}} className="absolute right-2 top-2 bg-[#25D366] text-white p-3 rounded-xl"><ArrowRight size={20}/></button>
              </div>
              <div className="flex flex-wrap gap-2">{recentCustomers.map((c, i) => (<button key={i} onClick={()=>{setCustomerName(c.name); setCustomerPhone(c.phone)}} className="bg-gray-50 px-3 py-2 rounded-xl text-[9px] font-black flex items-center gap-1 border"><Star size={8} fill="orange"/>{c.name}</button>))}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* HISTORY MODAL */}
      <AnimatePresence>
        {showHistory && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed inset-0 bg-white z-[150] flex flex-col p-6 text-left">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black uppercase">History</h2><button onClick={()=>setShowHistory(false)}><X size={24}/></button></div>
            <input type="text" placeholder="Search Token" value={historySearch} onChange={e=>setHistorySearch(e.target.value)} className="w-full bg-gray-50 border-2 rounded-2xl py-4 px-6 mb-6 font-black text-sm outline-none text-left"/>
            <div className="flex-grow overflow-y-auto space-y-4">{filteredHistory.map(o => (<div key={o.id} className="p-5 bg-gray-50 rounded-2xl border flex justify-between items-center text-left"><div className="text-left font-black"><div className="text-lg text-left">#{o.tokenNo}</div><div className="text-[10px] text-gray-400 text-left">₹{o.total}</div></div><button onClick={()=>{setLastOrder(o); setShowReceipt(true)}} className="bg-white px-5 py-2 rounded-xl text-[10px] font-black border-2 border-black">View</button></div>))}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cart.length > 0 && !showCartMobile && (
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="fixed bottom-6 left-4 right-4 bg-black text-white p-4 rounded-[2rem] z-40 flex items-center justify-between shadow-2xl border-t border-white/10">
            <div className="text-left font-black"><span className="text-[9px] text-gray-400 uppercase block">Total bill</span><span className="text-2xl italic">₹{cart.reduce((a,b)=>a+b.price,0)}</span></div>
            <button onClick={()=>setShowCartMobile(true)} className="bg-[#FFC107] text-black px-8 py-3 rounded-2xl font-black text-xs uppercase">Review Cart</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default POSDashboard;