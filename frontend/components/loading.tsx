import { Loader2 } from "lucide-react";
import { BrandIcon } from "./layout/brand-wordmark";

export function Loading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
      <div className="flex flex-col items-center gap-8 animate-fade-in">
        <div className="relative flex h-32 w-32 items-center justify-center">
          {/* Outer rotating ring */}
          <div className="absolute h-32 w-32 animate-spin-slow rounded-full border-2 border-primary/20 border-t-primary" />

          {/* Middle pulsing circle */}
          <div className="absolute h-28 w-28 animate-pulse rounded-full bg-primary/10" />

          {/* Inner spinner */}
          <Loader2 className="absolute h-24 w-24 animate-spin text-primary/30" />

          {/* Brand icon in the center */}
          <div className="relative z-10 scale-75">
            <BrandIcon />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes bounce-dot {
          0%, 80%, 100% {
            transform: translateY(0);
            opacity: 1;
          }
          40% {
            transform: translateY(-4px);
            opacity: 0.7;
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }
        
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }

        .animate-bounce-dot {
          display: inline-block;
          animation: bounce-dot 1.4s ease-in-out infinite;
        }

        .animation-delay-150 {
          animation-delay: 0.15s;
        }

        .animation-delay-300 {
          animation-delay: 0.3s;
        }
      `}</style>
    </div>
  );
}
