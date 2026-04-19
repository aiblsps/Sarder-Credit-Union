import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import myLogo from '../assets/logo.png'; 

export const LoadingScreen = () => {
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center overflow-hidden">
      <div className="flex flex-col items-center max-w-xs w-full px-6">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            duration: 1.2, 
            repeat: Infinity, 
            repeatType: "reverse",
            ease: "easeInOut" 
          }}
          className="-mb-5"
        >
          <img 
            src={myLogo} 
            alt="Logo" 
            className="w-48 h-48 object-contain" 
            referrerPolicy="no-referrer"
          />
        </motion.div>
        
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-black text-black tracking-tight">
            Sarder Credit Union
          </h1>
          <p className="text-base font-black text-black tracking-wide">
            হালাল আয়ে, সুন্দর আগামীর পথে
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
