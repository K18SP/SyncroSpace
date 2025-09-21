'use client';

import * as React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, ThumbsUp, Paperclip, Check, CheckCheck } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, rtdb } from '@/lib/firebase';
import { ref as rtdbRef, push, serverTimestamp as rtdbTimestamp, onValue, set } from 'firebase/database';
import { uploadFile } from '@/lib/firebase-upload';
import { Skeleton } from '../ui/skeleton';
import { Separator } from '../ui/separator';

interface Participant {
    uid: string;
    name: string;
    photoURL?: string;
    dnd?: boolean;
}

interface ChatPanelProps {
    participants: Participant[];
    spaceName: string;
    spaceId: string;
    canRead?: boolean; // optional: gate subscription based on membership/permissions
}

interface Message {
    id: string;
    uid: string;
    name: string;
    avatar?: string;
    message: string;
    type: 'text' | 'reaction' | 'image' | 'file';
    timestamp: any;
    readBy?: string[];
    fileName?: string;
    fileType?: string;
}

export function ChatPanel({ participants, spaceName, spaceId, canRead = true }: ChatPanelProps) {
    const [user] = useAuthState(auth);
    const [newMessage, setNewMessage] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Real-time listener for messages
    useEffect(() => {
        if (!spaceId) {
            console.log('No spaceId provided to chat panel');
            return;
        }
        if (!canRead) {
            setLoading(false);
            setError('You do not have access to view messages in this space.');
            return;
        }
        const messagesRef = rtdbRef(rtdb, `spaces/${spaceId}/messages`);
        const unsubscribe = onValue(messagesRef, (snapshot) => {
            const val = snapshot.val();
            const messagesData = val
                ? Object.entries(val).map(([id, data]) =>
                    typeof data === 'object' && data !== null
                        ? { ...(data as Message), id }
                        : { id, timestamp: 0 }
                  )
                : [];
            messagesData.sort((a, b) => ((a as Message).timestamp || 0) - ((b as Message).timestamp || 0));
            setMessages(messagesData as Message[]);
            setLoading(false);
            setError(null);
        }, (err) => {
            setError(`Failed to load messages: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [spaceId, canRead]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Mark messages as read
    // Mark messages as read (optional: implement for RTDB if needed)
    // useEffect(() => {
    //     if (!user || messages.length === 0) return;
    //     // Implement RTDB logic for read receipts if needed
    // }, [messages, user, spaceId]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!newMessage.trim() && !file) || !user || !spaceId) {
            console.log('Cannot send message:', { hasMessage: !!newMessage.trim(), hasUser: !!user, hasSpaceId: !!spaceId, hasFile: !!file });
            return;
        }
        try {
            const senderName = user.displayName || user.email?.split('@')[0] || 'User';
            let messageContent = newMessage.trim();
            let fileUrl = null;
            let fileType = 'text';
            if (file) {
                fileUrl = await uploadFile(file, 'chat');
                messageContent = fileUrl;
                if (file.type.startsWith('image/')) {
                    fileType = 'image';
                } else {
                    fileType = 'file';
                }
            }
            const msgRef = rtdbRef(rtdb, `spaces/${spaceId}/messages`);
            const newMsgRef = push(msgRef);
            await set(newMsgRef, {
                uid: user.uid,
                name: senderName,
                avatar: user.photoURL || null,
                message: messageContent,
                type: fileType,
                timestamp: Date.now(),
                readBy: [user.uid],
                fileName: file?.name || null,
                fileType: file?.type || null,
            });
            setNewMessage('');
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            console.error('Error sending message:', err);
            setError(`Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const handleSendReaction = async () => {
        if (!user || !spaceId) return;
        try {
            const senderName = user.displayName || user.email?.split('@')[0] || 'User';
            const msgRef = rtdbRef(rtdb, `spaces/${spaceId}/messages`);
            const newMsgRef = push(msgRef);
            await set(newMsgRef, {
                uid: user.uid,
                name: senderName,
                avatar: user.photoURL || null,
                message: '👍',
                type: 'reaction',
                timestamp: Date.now(),
                readBy: [user.uid],
            });
        } catch (err) {
            console.error('Error sending reaction:', err);
            setError('Failed to send reaction');
        }
    };

    const getParticipant = (uid: string) => participants.find(p => p.uid === uid);

    const getMessageStatus = (message: Message) => {
        const totalParticipants = participants.length;
        const readCount = message.readBy?.length || 0;

        if (readCount >= totalParticipants) {
            return <CheckCheck className="h-4 w-4 text-blue-400" />;
        }
        if (readCount > 1) {
            return <CheckCheck className="h-4 w-4" />;
        }
        return <Check className="h-4 w-4" />;
    };

    const formatTime = (timestamp: any) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Check if Firebase is properly configured
    // RTDB always initialized if Firebase is configured

    if (loading) {
        return (
            <div className="flex h-full flex-col">
                <ScrollArea className="flex-1">
                    <div className="space-y-4 p-4">
                        <Skeleton className="h-16 w-3/4" />
                        <Skeleton className="h-16 w-3/4 ml-auto" />
                        <Skeleton className="h-16 w-3/4" />
                    </div>
                </ScrollArea>
                <div className="border-t bg-muted/50 p-4">
                    <div className="flex gap-2">
                        <Input placeholder="Loading..." disabled className="flex-1" />
                        <Button disabled><Send className="h-4 w-4" /></Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            <ScrollArea className="flex-1" ref={scrollAreaRef}>
                <div className="space-y-4 p-4">
                    {error && (
                        <div className="text-center text-red-500 text-sm p-2 bg-red-50 rounded">
                            {error}
                        </div>
                    )}
                    {!error && !canRead && (
                        <div className="text-center text-muted-foreground text-sm p-4">
                            You don’t have permission to view messages here. Ask an admin to invite you to this space.
                        </div>
                    )}
                    
                    {messages.length === 0 && !error && (
                        <div className="text-center text-muted-foreground text-sm p-4">
                            No messages yet. Start the conversation!
                        </div>
                    )}

                    {messages.map((msg) => {
                        const participant = getParticipant(msg.uid);
                        const isReaction = msg.type === 'reaction';
                        const isOwnMessage = msg.uid === user?.uid;

                        return (
                            <div
                                key={msg.id}
                                className={`flex items-start gap-3 ${
                                    isOwnMessage ? 'flex-row-reverse' : ''
                                }`}
                            >
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={msg.avatar || participant?.photoURL} />
                                    <AvatarFallback className="text-xs">
                                        {msg.name?.charAt(0) || 'U'}
                                    </AvatarFallback>
                                </Avatar>

                                <div
                                    className={`max-w-[75%] rounded-lg p-3 text-sm ${
                                        isOwnMessage
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-muted'
                                    } ${isReaction ? 'bg-transparent p-1 text-2xl' : ''}`}
                                >
                                    {!isReaction && (
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <p className="font-semibold text-xs">{msg.name}</p>
                                            <p className="text-xs opacity-70">
                                                {formatTime(msg.timestamp)}
                                            </p>
                                        </div>
                                    )}

                                    {/* Render message content based on type */}
                                    {msg.type === 'image' ? (
                                        <img
                                            src={msg.message}
                                            alt={msg.fileName || 'image'}
                                            className="max-w-xs max-h-60 rounded shadow"
                                            style={{ marginBottom: '0.5rem' }}
                                        />
                                    ) : msg.type === 'file' ? (
                                        <a
                                            href={msg.message}
                                            download={msg.fileName || true}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 underline break-all"
                                        >
                                            {msg.fileName || 'Download file'}
                                        </a>
                                    ) : (
                                        <p className={`${isReaction ? 'leading-none' : ''}`}>
                                            {msg.message}
                                        </p>
                                    )}

                                    {isOwnMessage && !isReaction && (
                                        <div className="flex justify-end items-center mt-1">
                                            {getMessageStatus(msg)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>
            </ScrollArea>

            <div className="border-t bg-muted/50 p-4">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                    <Input
                        placeholder={`Message ${spaceName}`}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="flex-1"
                        disabled={!user || !spaceId}
                    />
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={e => {
                            if (e.target.files && e.target.files[0]) {
                                setFile(e.target.files[0]);
                            }
                        }}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!user || !spaceId}
                        className="shrink-0"
                        title="Attach file"
                    >
                        <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleSendReaction}
                        disabled={!user || !spaceId}
                        className="shrink-0"
                    >
                        <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button
                        type="submit"
                        disabled={(!newMessage.trim() && !file) || !user || !spaceId}
                        className="shrink-0"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </div>
        </div>
    );
}