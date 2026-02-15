import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Clock, Flame, Utensils, AlertTriangle } from 'lucide-react';
import { db } from '../../services/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy } from 'firebase/firestore';

const KitchenDisplay = () => {
  const [activeOrders, setActiveOrders] = useState([]);

  // 1. Live Listener for "Preparing" Orders
  useEffect(() => {
    const q = query(
      collection(db, "orders"),
      where("status", "==", "preparing"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        // Calculate minutes elapsed since order was placed
        elapsed: Math.floor((new Date() - doc.data().timestamp?.toDate()) / 60000)
      }));
      setActiveOrders(orders);
    });

    return () => unsubscribe();
  }, []);

  // 2. Mark Order as Done (Updates Captain & Admin Dashboards)
  const completeOrder = async (orderId) => {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, { status: "ready" });
  };

  return (
    <div className="min-h-screen bg-[#0F0F0F] p-6 text-white font-sans select-none">
      <header className="flex justify-between items-center mb-10 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tighter italic">
            <Flame className="text-orange-500 fill-orange-500" size={32} /> 
            GRILL <span className="text-orange-500">STATION</span>
          </h1>
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">Live Kitchen Feed</p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-orange-500/10 border border-orange-500/20 px-6 py-3 rounded-2xl flex flex-col items-center">
            <span className="text-[10px] font-black text-orange-500 uppercase">Queue</span>
            <span className="text-2xl font-black">{activeOrders.length}</span>
          </div>
        </div>
      </header>

      {/* TICKET GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence mode='popLayout'>
          {activeOrders.map((order) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, x: 100 }}
              key={order.id}
              className={`rounded-[2.5rem] overflow-hidden border-2 flex flex-col shadow-2xl transition-colors ${
                order.elapsed > 10 ? 'border-red-600 bg-red-950/20' : 'border-white/10 bg-[#1A1A1A]'
              }`}
            >
              {/* Ticket Header */}
              <div className={`p-5 flex justify-between items-center ${order.elapsed > 10 ? 'bg-red-600' : 'bg-[#FFC107]'}`}>
                <span className="text-black font-black text-3xl italic tracking-tighter">#{order.tokenNo}</span>
                <div className="flex items-center gap-1 text-black font-black text-xs uppercase">
                  <Clock size={14} /> {order.elapsed || 0}m ago
                </div>
              </div>

              {/* Order Content */}
              <div className="p-6 flex-grow">
                <p className="text-[10px] font-black text-gray-500 uppercase mb-4 tracking-widest">{order.type}</p>
                <div className="space-y-4">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start">
                      <span className="text-2xl font-black uppercase leading-none tracking-tighter">
                        {item.qty}x <span className="text-white/90">{item.name}</span>
                      </span>
                    </div>
                  ))}
                </div>
                
                {order.elapsed > 10 && (
                  <div className="mt-6 flex items-center gap-2 text-red-500 animate-pulse">
                    <AlertTriangle size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Urgent: Delay</span>
                  </div>
                )}
              </div>

              {/* Huge Action Button */}
              <button
                onClick={() => completeOrder(order.id)}
                className="w-full bg-[#2E7D32] hover:bg-[#388E3C] py-8 font-black text-2xl flex items-center justify-center gap-3 transition-all active:scale-95"
              >
                <CheckCircle size={28} strokeWidth={3} /> DONE
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {activeOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center h-[60vh] text-white/5">
          <Utensils size={120} strokeWidth={1} />
          <p className="text-2xl mt-4 font-black uppercase tracking-[0.3em]">Kitchen Clear</p>
        </div>
      )}
    </div>
  );
};

export default KitchenDisplay;