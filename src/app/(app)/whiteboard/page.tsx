
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useDebouncedCallback } from 'use-debounce';
import { PenSquare, RotateCcw, RotateCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { BoardSwitcher } from '@/components/whiteboard/board-switcher';
import { Button } from '@/components/ui/button';
import { DrawingCanvas } from '@/components/whiteboard/drawing-canvas';

// Define the structure for Excalidraw elements and app state
interface ExcalidrawScene {
    elements: readonly any[];
    appState: any;
}

// More specific dynamic import with better error handling
const ExcalidrawWrapper = dynamic(
  () => import('@/components/whiteboard/excalidraw-wrapper').then(mod => ({ default: mod.ExcalidrawWrapper })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="flex flex-col items-center space-y-4">
          <PenSquare className="h-12 w-12 animate-pulse text-blue-500" />
          <p className="text-lg text-gray-600">Loading Whiteboard...</p>
          <Skeleton className="h-8 w-48 bg-gray-200" />
        </div>
      </div>
    )
  }
);

export default function WhiteboardPage() {
    const [scene, setScene] = useState<ExcalidrawScene | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [boardId, setBoardId] = useState<string>('shared');
    
    const whiteboardDocRef = useMemo(() => doc(db, boardId === 'shared' ? 'whiteboard' : 'whiteboards', boardId), [boardId]);

    useEffect(() => {
        setIsLoading(true);
        setError(null);

        const unsubscribe = onSnapshot(
            whiteboardDocRef, 
            (doc) => {
                try {
                    if (doc.exists()) {
                        const data = doc.data() as ExcalidrawScene;
                        // Validate the data structure
                        if (data && Array.isArray(data.elements)) {
                            setScene(data);
                        } else {
                            // Initialize with default if data is malformed
                            const defaultScene = { 
                                elements: [], 
                                appState: { 
                                    viewBackgroundColor: '#ffffff',
                                    currentItemFontFamily: 1,
                                    currentItemStrokeColor: '#1e1e1e',
                                    currentItemBackgroundColor: 'transparent',
                                    currentItemFillStyle: 'solid',
                                    currentItemStrokeWidth: 1,
                                    currentItemStrokeStyle: 'solid',
                                    currentItemRoughness: 1,
                                    currentItemOpacity: 100
                                } 
                            };
                            setScene(defaultScene);
                            setDoc(whiteboardDocRef, defaultScene);
                        }
                    } else {
                        // Initialize with a default empty state if the document doesn't exist
                        const defaultScene = { 
                            elements: [], 
                            appState: { 
                                viewBackgroundColor: '#ffffff',
                                currentItemFontFamily: 1,
                                currentItemStrokeColor: '#1e1e1e',
                                currentItemBackgroundColor: 'transparent',
                                currentItemFillStyle: 'solid',
                                currentItemStrokeWidth: 1,
                                currentItemStrokeStyle: 'solid',
                                currentItemRoughness: 1,
                                currentItemOpacity: 100
                            } 
                        };
                        setScene(defaultScene);
                        setDoc(whiteboardDocRef, defaultScene);
                    }
                    setIsLoading(false);
                } catch (err) {
                    console.error('Error processing whiteboard data:', err);
                    setError('Failed to load whiteboard data');
                    setIsLoading(false);
                }
            },
            (err) => {
                console.error('Error listening to whiteboard:', err);
                setError('Failed to connect to whiteboard');
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [whiteboardDocRef]);

    const debouncedSave = useDebouncedCallback((elements, appState) => {
        try {
            // Save elements and essential app state
            const dataToSave = { 
                elements: elements || [], 
                appState: {
                    viewBackgroundColor: appState?.viewBackgroundColor || '#ffffff'
                }
            };
            setDoc(whiteboardDocRef, dataToSave, { merge: true });
        } catch (err) {
            console.error('Error saving whiteboard:', err);
        }
    }, 300);

    const handleExcalidrawChange = useCallback((elements: readonly any[], appState: any) => {
        // Update the local scene immediately for a responsive feel
        if (elements !== undefined && appState !== undefined) {
            const newScene = { elements, appState };
            setScene(newScene);
            debouncedSave(elements, appState);
        }
    }, [debouncedSave]);

    if (error) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-red-50">
                <div className="text-center space-y-4">
                    <PenSquare className="h-12 w-12 text-red-500 mx-auto" />
                    <p className="text-lg text-red-600">{error}</p>
                    <div className="space-x-2">
                        <button 
                            onClick={() => window.location.reload()} 
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                        >
                            Retry
                        </button>
                        <button 
                            onClick={() => window.location.href = '/dashboard'} 
                            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading || !scene) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center space-y-4">
                    <PenSquare className="h-16 w-16 animate-pulse text-blue-500" />
                    <p className="text-xl text-gray-600">Loading Whiteboard...</p>
                    <div className="flex space-x-2">
                        <Skeleton className="h-3 w-3 rounded-full bg-gray-300 animate-bounce" />
                        <Skeleton className="h-3 w-3 rounded-full bg-gray-300 animate-bounce delay-100" />
                        <Skeleton className="h-3 w-3 rounded-full bg-gray-300 animate-bounce delay-200" />
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="flex h-full w-full flex-col" style={{ height: 'calc(100vh - 4rem)' }}>
            <div className="flex-1">
                <DrawingCanvas boardPath={boardId === 'shared' ? 'whiteboard/shared' : `whiteboards/${boardId}`} />
            </div>
        </div>
    );
}
