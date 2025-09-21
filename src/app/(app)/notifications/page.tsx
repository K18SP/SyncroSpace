
'use client';

import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Bell, Mail } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function NotificationsPage() {
    const [user] = useAuthState(auth);

    const notificationsQuery = user 
        ? query(collection(db, 'users', user.uid, 'notifications'), orderBy('createdAt', 'desc'))
        : null;
    
    const [notificationsSnapshot, loading, error] = useCollection(notificationsQuery);

    const markAsRead = async (notificationId: string) => {
        if (!user) return;
        const notifRef = doc(db, 'users', user.uid, 'notifications', notificationId);
        await updateDoc(notifRef, { read: true });
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
                <p className="text-muted-foreground">
                    Your latest updates and mentions, all in one place.
                </p>
            </header>
            
            <Card>
                <CardContent className="p-0">
                   <div className="divide-y divide-border">
                        {loading && (
                            <div className="space-y-2 p-6">
                                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                            </div>
                        )}
                        {!loading && notificationsSnapshot?.docs.length === 0 && (
                            <div className="p-12 text-center text-muted-foreground">
                                <Bell className="mx-auto h-12 w-12" />
                                <h3 className="mt-4 text-lg font-medium">No new notifications</h3>
                                <p className="mt-1 text-sm">It's all quiet for now. We'll let you know when something new comes up.</p>
                            </div>
                        )}
                        {!loading && notificationsSnapshot?.docs.map(doc => {
                            type Notification = { id: string; link?: string; read?: boolean; title?: string; body?: string; createdAt?: any };
                            const notification = { id: doc.id, ...(doc.data() as any) } as Notification;
                            return (
                                <Link 
                                    href={notification.link || '#'} 
                                    key={notification.id} 
                                    className={cn(
                                        "block p-4 hover:bg-muted/50",
                                        !notification.read && "bg-primary/5 hover:bg-primary/10"
                                    )}
                                    onClick={() => markAsRead(notification.id)}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={cn("mt-1 h-2.5 w-2.5 rounded-full", !notification.read && "bg-primary")} />
                                        <div className="flex-1">
                                            <p className="font-semibold">{notification.title}</p>
                                            <p className="text-sm text-muted-foreground">{notification.body}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {notification.createdAt?.toDate().toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                   </div>
                   {error && <p className="p-4 text-sm text-destructive text-center">Error loading notifications.</p>}
                </CardContent>
            </Card>
        </div>
    )
}
