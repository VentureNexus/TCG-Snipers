import React, { useState } from "react";
import { useListProfiles, useCreateProfile, useDeleteProfile, getListProfilesQueryKey, useListCreditCards, useCreateCreditCard, useDeleteCreditCard, getListCreditCardsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, User as UserIcon, MapPin, CreditCard as CreditCardIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

const profileSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email(),
  phone: z.string().min(1, "Required"),
  shipFirstName: z.string().min(1, "Required"),
  shipLastName: z.string().min(1, "Required"),
  shipAddress1: z.string().min(1, "Required"),
  shipAddress2: z.string().optional(),
  shipCity: z.string().min(1, "Required"),
  shipState: z.string().min(1, "Required"),
  shipZip: z.string().min(1, "Required"),
  shipCountry: z.string().default("US"),
  billSameAsShip: z.boolean().default(true),
  addressJigEnabled: z.boolean().default(false),
});

const creditCardSchema = z.object({
  profileId: z.number().min(1),
  cardNickname: z.string().optional(),
  cardholderName: z.string().min(1, "Required"),
  cardNumber: z.string().min(15, "Required").max(19),
  cvv: z.string().min(3, "Required").max(4),
  expiryMonth: z.string().min(2, "Required").max(2),
  expiryYear: z.string().min(2, "Required").max(4),
});

export default function ProfilesPage() {
  const { data: profiles = [] } = useListProfiles();
  const { data: creditCards = [] } = useListCreditCards();
  const createProfile = useCreateProfile();
  const deleteProfile = useDeleteProfile();
  const createCreditCard = useCreateCreditCard();
  const deleteCreditCard = useDeleteCreditCard();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [ccProfileId, setCcProfileId] = useState<number | null>(null);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "", email: "", phone: "", shipFirstName: "", shipLastName: "",
      shipAddress1: "", shipAddress2: "", shipCity: "", shipState: "", shipZip: "",
      shipCountry: "US", billSameAsShip: true, addressJigEnabled: false,
    },
  });

  const ccForm = useForm<z.infer<typeof creditCardSchema>>({
    resolver: zodResolver(creditCardSchema),
    defaultValues: {
      profileId: 0, cardNickname: "", cardholderName: "", cardNumber: "",
      cvv: "", expiryMonth: "", expiryYear: ""
    }
  });

  const onSubmit = (values: z.infer<typeof profileSchema>) => {
    createProfile.mutate({ data: values }, {
      onSuccess: () => {
        setCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
        form.reset();
      }
    });
  };

  const onCcSubmit = (values: z.infer<typeof creditCardSchema>) => {
    createCreditCard.mutate({ data: values }, {
      onSuccess: () => {
        setCcProfileId(null);
        queryClient.invalidateQueries({ queryKey: getListCreditCardsQueryKey() });
        ccForm.reset();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold hidden">Profiles</h2>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-profile">
              <Plus className="w-4 h-4" /> New Profile
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Profile</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground border-b border-border/50 pb-2">General</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Profile Name</FormLabel><FormControl><Input placeholder="Main Profile" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="john@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="phone" render={({ field }) => (
                      <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="555-555-5555" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground border-b border-border/50 pb-2">Shipping Address</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="shipFirstName" render={({ field }) => (
                      <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="shipLastName" render={({ field }) => (
                      <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="shipAddress1" render={({ field }) => (
                    <FormItem><FormLabel>Address Line 1</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="shipAddress2" render={({ field }) => (
                    <FormItem><FormLabel>Address Line 2</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="shipCity" render={({ field }) => (
                      <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="shipState" render={({ field }) => (
                      <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="shipZip" render={({ field }) => (
                      <FormItem><FormLabel>Zip Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>
                
                <div className="space-y-4 pt-2">
                   <FormField control={form.control} name="addressJigEnabled" render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border/50 p-4 bg-muted/10">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Enable Address Jigging</FormLabel>
                          <p className="text-xs text-muted-foreground">Slightly varies address strings to reduce duplicate-address detection.</p>
                        </div>
                      </FormItem>
                    )} />
                </div>

                <Button type="submit" className="w-full" disabled={createProfile.isPending}>
                  {createProfile.isPending ? "Creating..." : "Save Profile"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!ccProfileId} onOpenChange={(open) => { if (!open) setCcProfileId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Credit Card</DialogTitle>
          </DialogHeader>
          <Form {...ccForm}>
            <form onSubmit={ccForm.handleSubmit(onCcSubmit)} className="space-y-4">
              <FormField control={ccForm.control} name="cardNickname" render={({ field }) => (
                <FormItem><FormLabel>Card Nickname</FormLabel><FormControl><Input placeholder="Main Amex" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={ccForm.control} name="cardholderName" render={({ field }) => (
                <FormItem><FormLabel>Cardholder Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={ccForm.control} name="cardNumber" render={({ field }) => (
                <FormItem><FormLabel>Card Number</FormLabel><FormControl><Input placeholder="•••• •••• •••• ••••" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-3 gap-4">
                <FormField control={ccForm.control} name="expiryMonth" render={({ field }) => (
                  <FormItem><FormLabel>Exp Month</FormLabel><FormControl><Input placeholder="MM" maxLength={2} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={ccForm.control} name="expiryYear" render={({ field }) => (
                  <FormItem><FormLabel>Exp Year</FormLabel><FormControl><Input placeholder="YY" maxLength={4} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={ccForm.control} name="cvv" render={({ field }) => (
                  <FormItem><FormLabel>CVV</FormLabel><FormControl><Input type="password" maxLength={4} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <Button type="submit" className="w-full" disabled={createCreditCard.isPending}>Add Card</Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {profiles.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground glass-card rounded-lg">
          <UserIcon className="w-10 h-10 mx-auto opacity-20 mb-4" />
          <p>No profiles created yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {profiles.map(profile => {
            const profileCards = creditCards.filter(c => c.profileId === profile.id);
            return (
              <Card key={profile.id} className="glass-card relative group">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg truncate pr-6" title={profile.name}>{profile.name}</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={() => deleteProfile.mutate({ id: profile.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() }) })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground truncate">{profile.email}</div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground pb-4">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 opacity-50" />
                    <div className="truncate">
                      {profile.shipAddress1}<br />
                      {profile.shipCity}, {profile.shipState} {profile.shipZip}
                    </div>
                  </div>
                  {profileCards.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-1 border-b border-border/50 pb-1">Payment Cards</div>
                      {profileCards.map(c => (
                        <div key={c.id} className="flex justify-between items-center text-xs bg-background/50 p-1.5 rounded border border-border/30">
                          <span className="font-mono text-primary">{c.cardType || 'Card'} •••• {c.lastFour}</span>
                          <div className="flex gap-2 items-center">
                            <span className="text-muted-foreground">{c.expiryMonth}/{c.expiryYear}</span>
                            <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive" onClick={() => deleteCreditCard.mutate({ id: c.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCreditCardsQueryKey() }) })}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="pt-0 border-t border-border/50 bg-muted/10 mt-auto rounded-b-lg">
                  <div className="flex items-center justify-between w-full mt-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-foreground/80">
                      <CreditCardIcon className="w-4 h-4 opacity-50" />
                      {profileCards.length} Cards linked
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => {
                      ccForm.setValue('profileId', profile.id);
                      setCcProfileId(profile.id);
                    }}>
                      + Add Card
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
