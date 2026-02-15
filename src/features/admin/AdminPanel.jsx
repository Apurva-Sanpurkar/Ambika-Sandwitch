import React, { useState, useEffect } from 'react';
import { db } from '../../services/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { 
  TrendingUp, 
  Package, 
  CheckCircle2, 
  ShoppingBag, 
  BarChart3, 
  Power 
} from 'lucide-react';
import { motion } from 'framer-motion';
import { MENU_DATA } from '../../utils/menuData';

const AdminPanel = () => {
  const [stats, setStats] = useState({ revenue: 0, orders: 0, completed: 0 });
  const [topItems, setTopItems] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [availability, setAvailability] = useState({});

  useEffect(() => {
    // 1. Listen to all orders
    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"));
    const unsubOrders = onSnapshot(q, (snapshot) => {
      let dailyRevenue = 0;
      let dailyCompleted = 0;
      const itemCounts = {};
      const orders = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        dailyRevenue += data.total || 0;
        if (data.status === 'ready') dailyCompleted++;
        data.items?.forEach(item => {
          itemCounts[item.name] = (itemCounts[item.name] || 0) + item.qty;
        });
        orders.push({ id: doc.id, ...data });
      });

      const sortedItems = Object.entries(itemCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setStats({ revenue: dailyRevenue, orders: snapshot.size, completed: dailyCompleted });
      setTopItems(sortedItems);
      setRecentOrders(orders.slice(0, 8));
    });

    // 2. Listen to Menu Availability
    const unsubAvailability = onSnapshot(doc(db, "menu_status", "availability"), (docSnap) => {
      if (docSnap.exists()) {
        setAvailability(docSnap.data());
      }
    });

    return () => {
      unsubOrders();
      unsubAvailability();
    };
  }, []);

  // 3. Toggle Function for Sold Out Items
  const handleToggle = async (itemId) => {
    const itemRef = doc(db, "menu_status", "availability");
    const currentStatus = availability[itemId] !== false; // Defaults to true
    await updateDoc(itemRef, {
      [itemId]: !currentStatus
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-8 font-sans text-[#1A1A1A]">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black italic tracking-tighter uppercase">Owner's <span className="text-orange-500">Insights</span></h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Ambika Sandwich Performance</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-gray-400 uppercase">Live Update</p>
          <div className="flex items-center gap-2 text-green-500 font-black">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            SYNCED
          </div>
        </div>
      </header>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Daily Revenue" value={`₹${stats.revenue.toLocaleString()}`} icon={<TrendingUp size={20}/>} color="bg-green-500" />
        <StatCard title="Total Orders" value={stats.orders} icon={<ShoppingBag size={20}/>} color="bg-blue-500" />
        <StatCard title="Completion Rate" value={`${stats.orders ? Math.round((stats.completed/stats.orders)*100) : 0}%`} icon={<CheckCircle2 size={20}/>} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* RECENT TRANSACTIONS */}
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex justify-between items-center">
              <h2 className="font-black uppercase text-xs tracking-widest text-gray-400">Live Transaction Log</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Token</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Items</th>
                    <th className="px-6 py-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-5">#{order.tokenNo}</td>
                      <td className="px-6 py-5">
                        <span className={`text-[9px] px-2 py-1 rounded-md ${order.type === 'PARCEL' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                          {order.type}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-gray-400">{order.items?.length} items</td>
                      <td className="px-6 py-5 text-right font-black text-green-700">₹{order.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* INVENTORY / SOLD OUT TOGGLES */}
          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
            <h2 className="font-black uppercase text-xs tracking-widest text-gray-400 mb-6 flex items-center gap-2">
              <Power size={14} /> Inventory Control (Sold Out)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(MENU_DATA).flatMap(([cat, items]) => items).map((item) => {
                const isAvailable = availability[item.id] !== false;
                return (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <span className="text-xs font-bold uppercase tracking-tight">{item.name}</span>
                    <button 
                      onClick={() => handleToggle(item.id)}
                      className={`relative w-12 h-6 rounded-full transition-all duration-300 ${isAvailable ? 'bg-green-500' : 'bg-red-500'}`}
                    >
                      <div className={`absolute top-1 bg-white w-4 h-4 rounded-full transition-all shadow-md ${isAvailable ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* TOP SELLING ITEMS */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-8 h-fit sticky top-8">
          <h2 className="font-black uppercase text-xs tracking-widest text-gray-400 mb-8 flex items-center gap-2">
            <BarChart3 size={16} /> Best Sellers
          </h2>
          <div className="space-y-6">
            {topItems.map((item, index) => (
              <div key={index} className="flex flex-col gap-2">
                <div className="flex justify-between text-sm font-black uppercase">
                  <span>{item.name}</span>
                  <span className="text-orange-500">{item.count} sold</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.count / (topItems[0]?.count || 1)) * 100}%` }}
                    className="bg-orange-500 h-full rounded-full"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center justify-between">
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{title}</p>
      <p className="text-4xl font-black tracking-tighter">{value}</p>
    </div>
    <div className={`p-4 ${color} text-white rounded-2xl shadow-lg`}>
      {icon}
    </div>
  </div>
);

export default AdminPanel;