
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Contact, MessageSquare, UserPlus, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, getDocs, doc, setDoc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import Link from 'next/link';
import { useAuthState } from 'react-firebase-hooks/auth';

interface SyncedContact {
  name: string;
  tel: string;
  isUser: boolean;
  uid?: string;
  photoURL?: string;
}

export default function ContactsPage() {
  const [user] = useAuthState(auth);
  const [isLoading, setIsLoading] = useState(false);
  const [syncedContacts, setSyncedContacts] = useState<SyncedContact[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const loadSyncedContacts = async () => {
        if (!user) return;
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().syncedContacts) {
            setSyncedContacts(userDoc.data().syncedContacts);
        }
    };
    loadSyncedContacts();
  }, [user]);

  const handleRemoveContact = async (contactToRemove: SyncedContact) => {
    if (!user) return;
    const userDocRef = doc(db, 'users', user.uid);
    try {
        await updateDoc(userDocRef, {
            syncedContacts: arrayRemove(contactToRemove)
        });
        setSyncedContacts(prev => prev.filter(c => c.tel !== contactToRemove.tel));
        toast({
            title: 'Contact Removed',
            description: `${contactToRemove.name} has been removed from your synced contacts.`
        });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error Removing Contact',
            description: error.message,
        });
    }
  }

  const handleSyncContacts = async () => {
    if (!('contacts' in navigator && 'select' in (navigator as any).contacts)) {
      toast({
        variant: 'destructive',
        title: 'Unsupported Browser',
        description: 'Your browser does not support the Contact Picker API.',
      });
      return;
    }
    if (!user) return;

    setIsLoading(true);

    try {
      const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true });
      if (contacts.length === 0) {
        toast({ title: 'No contacts selected.' });
        setIsLoading(false);
        return;
      }

      const phoneNumbers = contacts.map((c: any) => c.tel[0]).filter(Boolean);
      
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('phoneNumber', 'in', phoneNumbers));
      const querySnapshot = await getDocs(q);
    type ExistingUser = { uid: string; phoneNumber?: string; photoURL?: string };
    const existingUsers: ExistingUser[] = querySnapshot.docs.map(doc => ({ uid: doc.id, ...(doc.data() as any)}));
      
      const processedContacts: SyncedContact[] = contacts.map((contact: any): SyncedContact => {
        const tel = contact.tel[0];
    const existingUser = existingUsers.find((u: ExistingUser) => u.phoneNumber === tel);
        return {
          name: contact.name[0],
          tel,
          isUser: !!existingUser,
          uid: existingUser?.uid,
          photoURL: existingUser?.photoURL
        };
      });

      // Merge with existing contacts, avoiding duplicates
      const updatedContacts = [...syncedContacts];
      processedContacts.forEach(newContact => {
        if (!updatedContacts.some(c => c.tel === newContact.tel)) {
            updatedContacts.push(newContact);
        }
      });
      
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, { syncedContacts: updatedContacts }, { merge: true });

      setSyncedContacts(updatedContacts);

      toast({
        title: 'Contacts Synced',
        description: `Found ${existingUsers.length} new contacts on SyncroSpace.`,
      });

    } catch (error: any) {
        if (error.name === 'AbortError') {
             toast({
                title: 'Contact Sync Cancelled',
                description: 'You cancelled the contact selection.',
             });
        } else {
            toast({
                variant: 'destructive',
                title: 'Error Syncing Contacts',
                description: error.message || 'An unknown error occurred.',
            });
        }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
            <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
            <p className="text-muted-foreground max-w-2xl">
                Sync your device contacts to find colleagues already on SyncroSpace or invite new ones.
            </p>
            </div>
            <Button onClick={handleSyncContacts} disabled={isLoading}>
                {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Contact className="mr-2 h-4 w-4" />
                )}
                Sync Contacts
            </Button>
        </header>

        <Card>
            <CardHeader>
                <CardTitle>Synced Contacts</CardTitle>
                <CardDescription>
                    {syncedContacts.length > 0
                        ? `Showing ${syncedContacts.length} synced contact(s).`
                        : 'Your synced contacts will appear here.'
                    }
                </CardDescription>
            </CardHeader>
            <CardContent>
                {syncedContacts.length > 0 ? (
                    <div className="divide-y divide-border">
                        {syncedContacts.map((contact, index) => (
                            <div key={index} className="flex items-center justify-between py-4">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={contact.photoURL} />
                                        <AvatarFallback>{getInitials(contact.name)}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-semibold">{contact.name}</p>
                                        <p className="text-sm text-muted-foreground">{contact.tel}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {contact.isUser && contact.uid ? (
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={`/chat/${contact.uid}`}>
                                                <MessageSquare className="mr-2 h-4 w-4" />
                                                Message
                                            </Link>
                                        </Button>
                                    ) : (
                                        <Button size="sm">
                                            <UserPlus className="mr-2 h-4 w-4" />
                                            Invite
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveContact(contact)}>
                                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center">
                        <Contact className="h-12 w-12 text-muted-foreground" />
                        <h3 className="text-xl font-medium mt-4">No contacts synced</h3>
                        <p className="text-sm text-muted-foreground mt-2">
                           Click the "Sync Contacts" button to find your colleagues.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
