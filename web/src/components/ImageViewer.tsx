import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize } from "lucide-react";

type ImageViewerProps = {
    images: { url: string; title?: string }[];
    initialIndex?: number;
    onClose: () => void;
};

export function ImageViewer({ images, initialIndex = 0, onClose }: ImageViewerProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [scale, setScale] = useState(1);
    const [isFullSize, setIsFullSize] = useState(false);

    // Escuchar tecla Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowRight") handleNext();
            if (e.key === "ArrowLeft") handlePrev();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentIndex, onClose]);

    if (!images || images.length === 0) return null;

    const handlePrev = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setScale(1);
        setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    };

    const handleNext = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setScale(1);
        setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    };

    const zoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale(s => Math.min(s + 0.5, 4));
    };

    const zoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setScale(s => Math.max(s - 0.5, 0.5));
    };

    const currentImage = images[currentIndex];

    return (
        <div className="fixed inset-0 z-[100] flex animate-in fade-in duration-200 bg-black/95 backdrop-blur-sm" onClick={onClose}>

            {/* Top Header */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent z-10" onClick={e => e.stopPropagation()}>
                <div className="text-white">
                    <span className="font-bold">{currentIndex + 1} / {images.length}</span>
                    {currentImage.title && <span className="ml-4 text-sm text-slate-300">{currentImage.title}</span>}
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex bg-black/50 rounded-lg p-1">
                        <button onClick={zoomOut} className="p-2 text-white hover:bg-white/20 rounded transition-colors"><ZoomOut size={18} /></button>
                        <button onClick={() => setScale(1)} className="px-3 text-white text-xs font-bold hover:bg-white/20 rounded transition-colors">{Math.round(scale * 100)}%</button>
                        <button onClick={zoomIn} className="p-2 text-white hover:bg-white/20 rounded transition-colors"><ZoomIn size={18} /></button>
                    </div>

                    <button onClick={() => setIsFullSize(!isFullSize)} className="p-2 text-white bg-black/50 hover:bg-white/20 rounded-lg transition-colors" title="Toggle object-contain/cover">
                        {isFullSize ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>

                    <button onClick={onClose} className="p-2 text-white bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors ml-4">
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* Navegación Izquierda */}
            {images.length > 1 && (
                <button
                    onClick={handlePrev}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-4 bg-black/50 hover:bg-white/20 rounded-full text-white transition-all hover:-translate-x-1"
                >
                    <ChevronLeft size={32} />
                </button>
            )}

            {/* Imagen */}
            <div className="w-full h-full flex items-center justify-center p-12 overflow-hidden">
                <img
                    src={currentImage.url}
                    alt={currentImage.title || "Image detail"}
                    className="transition-transform duration-200"
                    style={{
                        transform: `scale(${scale})`,
                        maxHeight: '100%',
                        maxWidth: '100%',
                        objectFit: isFullSize ? 'cover' : 'contain'
                    }}
                    onClick={e => e.stopPropagation()}
                    onDoubleClick={() => setScale(s => s === 1 ? 2 : 1)}
                />
            </div>

            {/* Navegación Derecha */}
            {images.length > 1 && (
                <button
                    onClick={handleNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-4 bg-black/50 hover:bg-white/20 rounded-full text-white transition-all hover:translate-x-1"
                >
                    <ChevronRight size={32} />
                </button>
            )}

        </div>
    );
}
