import { useState, useRef, useEffect } from "react";
import {
  useListProfiles,
  useCreateProfile,
  useUpdateProfile,
  useDeleteProfile,
  useListCreditCards,
  useCreateCreditCard,
  useDeleteCreditCard,
  getListProfilesQueryKey,
  getListCreditCardsQueryKey,
} from "@workspace/api-client-react";
import type { Profile, CreditCard } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  User,
  MapPin,
  CreditCard as CreditCardIcon,
  Plus,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Upload,
  Download,
  Info,
  Zap,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const profileSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  shipFirstName: z.string().min(1, "Required"),
  shipLastName: z.string().min(1, "Required"),
  shipAddress1: z.string().min(1, "Required"),
  shipAddress2: z.string().optional(),
  shipCity: z.string().min(1, "Required"),
  shipState: z.string().min(1, "Required"),
  shipZip: z.string().min(1, "Required"),
  shipCountry: z.string().default("US"),
  billSameAsShip: z.boolean().default(true),
  billFirstName: z.string().optional(),
  billLastName: z.string().optional(),
  billAddress1: z.string().optional(),
  billAddress2: z.string().optional(),
  billCity: z.string().optional(),
  billState: z.string().optional(),
  billZip: z.string().optional(),
  billCountry: z.string().optional(),
  addressJigEnabled: z.boolean().default(false),
  costcoMembershipId: z.string().optional(),
});

const creditCardSchema = z.object({
  cardNickname: z.string().optional(),
  cardholderName: z.string().min(1, "Required"),
  cardNumber: z.string().min(15, "Card number too short").max(19),
  cvv: z.string().min(3, "CVV too short").max(4),
  expiryMonth: z.string().length(2, "MM"),
  expiryYear: z.string().min(2, "YY").max(4),
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type CreditCardFormValues = z.infer<typeof creditCardSchema>;

const CARD_TYPE_COLORS: Record<string, string> = {
  visa: "text-blue-400",
  mastercard: "text-orange-400",
  amex: "text-green-400",
  discover: "text-yellow-400",
};

function getCardTypeColor(type: string) {
  return CARD_TYPE_COLORS[type?.toLowerCase()] ?? "text-primary";
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b border-border/50 pb-2 mb-4">
      {children}
    </h3>
  );
}

interface ProfileFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProfile: Profile | null;
  onDone: () => void;
}

function ProfileFormDialog({
  open,
  onOpenChange,
  editingProfile,
  onDone,
}: ProfileFormDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();

  const defaultValues: ProfileFormValues = {
    name: "",
    email: "",
    phone: "",
    shipFirstName: "",
    shipLastName: "",
    shipAddress1: "",
    shipAddress2: "",
    shipCity: "",
    shipState: "",
    shipZip: "",
    shipCountry: "US",
    billSameAsShip: true,
    billFirstName: "",
    billLastName: "",
    billAddress1: "",
    billAddress2: "",
    billCity: "",
    billState: "",
    billZip: "",
    billCountry: "US",
    addressJigEnabled: false,
    costcoMembershipId: "",
  };

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  });

  const billSameAsShip = useWatch({ control: form.control, name: "billSameAsShip" });

  const isEditing = !!editingProfile;
  const isPending = createProfile.isPending || updateProfile.isPending;

  useEffect(() => {
    if (!open) return;
    if (editingProfile) {
      form.reset({
        name: editingProfile.name,
        email: editingProfile.email,
        phone: editingProfile.phone ?? "",
        shipFirstName: editingProfile.shipFirstName,
        shipLastName: editingProfile.shipLastName,
        shipAddress1: editingProfile.shipAddress1,
        shipAddress2: editingProfile.shipAddress2 ?? "",
        shipCity: editingProfile.shipCity,
        shipState: editingProfile.shipState,
        shipZip: editingProfile.shipZip,
        shipCountry: editingProfile.shipCountry || "US",
        billSameAsShip: editingProfile.billSameAsShip,
        billFirstName: editingProfile.billFirstName ?? "",
        billLastName: editingProfile.billLastName ?? "",
        billAddress1: editingProfile.billAddress1 ?? "",
        billAddress2: editingProfile.billAddress2 ?? "",
        billCity: editingProfile.billCity ?? "",
        billState: editingProfile.billState ?? "",
        billZip: editingProfile.billZip ?? "",
        billCountry: editingProfile.billCountry ?? "US",
        addressJigEnabled: editingProfile.addressJigEnabled,
        costcoMembershipId: editingProfile.costcoMembershipId ?? "",
      });
    } else {
      form.reset(defaultValues);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingProfile?.id]);

  function onSubmit(values: ProfileFormValues) {
    const data = {
      ...values,
      phone: values.phone || "",
      shipAddress2: values.shipAddress2 || "",
      costcoMembershipId: values.costcoMembershipId || "",
    };

    if (isEditing && editingProfile) {
      updateProfile.mutate(
        { id: editingProfile.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
            toast({ title: "Profile updated" });
            onOpenChange(false);
            onDone();
          },
          onError: () => toast({ title: "Failed to update profile", variant: "destructive" }),
        }
      );
    } else {
      createProfile.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
            toast({ title: "Profile created" });
            onOpenChange(false);
            onDone();
            form.reset(defaultValues);
          },
          onError: () => toast({ title: "Failed to create profile", variant: "destructive" }),
        }
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Profile" : "Create New Profile"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Identity */}
            <div>
              <SectionHeader>Identity</SectionHeader>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Profile Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Main Profile" {...field} data-testid="input-profile-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="john@example.com" {...field} data-testid="input-profile-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="555-555-5555" {...field} data-testid="input-profile-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="costcoMembershipId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costco Membership ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional" {...field} data-testid="input-costco-membership" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Shipping Address */}
            <div>
              <SectionHeader>Shipping Address</SectionHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="shipFirstName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl><Input {...field} data-testid="input-ship-first-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="shipLastName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl><Input {...field} data-testid="input-ship-last-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="shipAddress1" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 1</FormLabel>
                    <FormControl><Input placeholder="123 Main Street" {...field} data-testid="input-ship-address1" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="shipAddress2" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2 <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="Apt 4B" {...field} data-testid="input-ship-address2" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-3 gap-4">
                  <FormField control={form.control} name="shipCity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl><Input {...field} data-testid="input-ship-city" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="shipState" render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl><Input placeholder="CA" maxLength={2} {...field} data-testid="input-ship-state" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="shipZip" render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP</FormLabel>
                      <FormControl><Input placeholder="90210" {...field} data-testid="input-ship-zip" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="shipCountry" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl><Input placeholder="US" {...field} data-testid="input-ship-country" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Billing Address */}
            <div>
              <SectionHeader>Billing Address</SectionHeader>
              <FormField control={form.control} name="billSameAsShip" render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 mb-4">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-bill-same-as-ship"
                    />
                  </FormControl>
                  <FormLabel className="!mt-0 cursor-pointer">Same as shipping address</FormLabel>
                </FormItem>
              )} />

              {!billSameAsShip && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="billFirstName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl><Input {...field} data-testid="input-bill-first-name" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="billLastName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl><Input {...field} data-testid="input-bill-last-name" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="billAddress1" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 1</FormLabel>
                      <FormControl><Input {...field} data-testid="input-bill-address1" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="billAddress2" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address Line 2</FormLabel>
                      <FormControl><Input {...field} data-testid="input-bill-address2" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="billCity" render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl><Input {...field} data-testid="input-bill-city" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="billState" render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl><Input placeholder="CA" maxLength={2} {...field} data-testid="input-bill-state" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="billZip" render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP</FormLabel>
                        <FormControl><Input {...field} data-testid="input-bill-zip" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="billCountry" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl><Input placeholder="US" {...field} data-testid="input-bill-country" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
            </div>

            {/* Address Jig */}
            <div>
              <SectionHeader>Options</SectionHeader>
              <FormField control={form.control} name="addressJigEnabled" render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 rounded-lg border border-border/50 p-4 bg-muted/10">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-address-jig"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FormLabel className="cursor-pointer flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-yellow-400" />
                        Enable Address Jigging
                      </FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          When enabled, each task run slightly varies the address string (e.g. "St" vs "Street", "Apt" vs "Apartment") to reduce duplicate-address detection by retailer fraud systems.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Randomizes address abbreviations on each checkout attempt.
                    </p>
                  </div>
                </FormItem>
              )} />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-profile"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending}
                data-testid="button-save-profile"
              >
                {isPending ? "Saving..." : isEditing ? "Save Changes" : "Create Profile"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface AddCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: number;
  existingCardCount: number;
}

function AddCardDialog({ open, onOpenChange, profileId, existingCardCount }: AddCardDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createCreditCard = useCreateCreditCard();

  const form = useForm<CreditCardFormValues>({
    resolver: zodResolver(creditCardSchema),
    defaultValues: {
      cardNickname: "",
      cardholderName: "",
      cardNumber: "",
      cvv: "",
      expiryMonth: "",
      expiryYear: "",
    },
  });

  function onSubmit(values: CreditCardFormValues) {
    if (existingCardCount >= 5) {
      toast({ title: "Maximum 5 cards per profile", variant: "destructive" });
      return;
    }
    createCreditCard.mutate(
      { data: { ...values, profileId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCreditCardsQueryKey() });
          toast({ title: "Card added" });
          onOpenChange(false);
          form.reset();
        },
        onError: () => toast({ title: "Failed to add card", variant: "destructive" }),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add Credit Card</DialogTitle>
        </DialogHeader>
        {existingCardCount >= 5 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Maximum of 5 cards per profile reached. Remove a card to add a new one.
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="cardNickname" render={({ field }) => (
                <FormItem>
                  <FormLabel>Card Nickname <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Main Visa" {...field} data-testid="input-card-nickname" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="cardholderName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cardholder Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} data-testid="input-cardholder-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="cardNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Card Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="•••• •••• •••• ••••"
                      maxLength={19}
                      {...field}
                      data-testid="input-card-number"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="expiryMonth" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Month</FormLabel>
                    <FormControl>
                      <Input placeholder="MM" maxLength={2} {...field} data-testid="input-expiry-month" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="expiryYear" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year</FormLabel>
                    <FormControl>
                      <Input placeholder="YY" maxLength={4} {...field} data-testid="input-expiry-year" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cvv" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CVV</FormLabel>
                    <FormControl>
                      <Input type="password" maxLength={4} {...field} data-testid="input-cvv" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createCreditCard.isPending}
                data-testid="button-add-card-submit"
              >
                {createCreditCard.isPending ? "Adding..." : "Add Card"}
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ProfileCardProps {
  profile: Profile;
  cards: CreditCard[];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddCard: () => void;
  onDeleteCard: (cardId: number) => void;
}

function ProfileCard({
  profile,
  cards,
  onEdit,
  onDuplicate,
  onDelete,
  onAddCard,
  onDeleteCard,
}: ProfileCardProps) {
  return (
    <Card className="glass-card flex flex-col" data-testid={`card-profile-${profile.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate" title={profile.name}>
              {profile.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{profile.email}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                data-testid={`button-menu-profile-${profile.id}`}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit} data-testid={`menu-edit-profile-${profile.id}`}>
                <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate} data-testid={`menu-duplicate-profile-${profile.id}`}>
                <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
                data-testid={`menu-delete-profile-${profile.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {profile.addressJigEnabled && (
            <Badge variant="outline" className="text-yellow-400 border-yellow-400/20 bg-yellow-400/5 text-[10px] gap-1">
              <Zap className="w-2.5 h-2.5" /> Jig On
            </Badge>
          )}
          {profile.costcoMembershipId && (
            <Badge variant="outline" className="text-blue-400 border-blue-400/20 bg-blue-400/5 text-[10px]">
              Costco
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            <CreditCardIcon className="w-2.5 h-2.5 mr-1" />
            {cards.length}/5 cards
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pb-3 text-xs text-muted-foreground">
        {profile.shipAddress1 && (
          <div className="flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-50" />
            <div>
              <div>{profile.shipFirstName} {profile.shipLastName}</div>
              <div className="truncate">{profile.shipAddress1}{profile.shipAddress2 ? `, ${profile.shipAddress2}` : ""}</div>
              <div>{profile.shipCity}, {profile.shipState} {profile.shipZip}</div>
            </div>
          </div>
        )}

        {cards.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 border-b border-border/30 pb-1">
              Payment Cards
            </div>
            {cards.map((card) => (
              <div
                key={card.id}
                className="flex items-center justify-between gap-2 bg-background/40 rounded px-2 py-1.5 border border-border/30 group/card"
                data-testid={`card-credit-${card.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-mono font-semibold text-[11px] ${getCardTypeColor(card.cardType)}`}>
                    {card.cardType ? card.cardType.toUpperCase() : "CARD"}
                  </span>
                  <span className="font-mono text-[11px]">••••&nbsp;{card.lastFour}</span>
                  {card.cardNickname && (
                    <span className="text-muted-foreground/60 truncate text-[10px]">({card.cardNickname})</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-muted-foreground/60 text-[10px]">{card.expiryMonth}/{card.expiryYear}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 opacity-0 group-hover/card:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    onClick={() => onDeleteCard(card.id)}
                    data-testid={`button-delete-card-${card.id}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-primary hover:text-primary/80 h-7"
          onClick={onAddCard}
          disabled={cards.length >= 5}
          data-testid={`button-add-card-${profile.id}`}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          {cards.length >= 5 ? "Card Limit Reached" : "Add Payment Card"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function ProfilesPage() {
  const { data: profiles = [], isLoading } = useListProfiles();
  const { data: allCards = [] } = useListCreditCards();
  const createProfile = useCreateProfile();
  const deleteProfile = useDeleteProfile();
  const deleteCreditCard = useDeleteCreditCard();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [addCardProfileId, setAddCardProfileId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  function openCreate() {
    setEditingProfile(null);
    setFormOpen(true);
  }

  function openEdit(profile: Profile) {
    setEditingProfile(profile);
    setFormOpen(true);
  }

  function handleDuplicate(profile: Profile) {
    createProfile.mutate(
      {
        data: {
          name: `${profile.name} (Copy)`,
          email: profile.email,
          phone: profile.phone ?? "",
          shipFirstName: profile.shipFirstName,
          shipLastName: profile.shipLastName,
          shipAddress1: profile.shipAddress1,
          shipAddress2: profile.shipAddress2 ?? "",
          shipCity: profile.shipCity,
          shipState: profile.shipState,
          shipZip: profile.shipZip,
          shipCountry: profile.shipCountry,
          billSameAsShip: profile.billSameAsShip,
          billFirstName: profile.billFirstName ?? "",
          billLastName: profile.billLastName ?? "",
          billAddress1: profile.billAddress1 ?? "",
          billAddress2: profile.billAddress2 ?? "",
          billCity: profile.billCity ?? "",
          billState: profile.billState ?? "",
          billZip: profile.billZip ?? "",
          billCountry: profile.billCountry ?? "US",
          addressJigEnabled: profile.addressJigEnabled,
          costcoMembershipId: profile.costcoMembershipId ?? "",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
          toast({ title: "Profile duplicated" });
        },
        onError: () => toast({ title: "Failed to duplicate profile", variant: "destructive" }),
      }
    );
  }

  function handleDelete(id: number) {
    deleteProfile.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
          toast({ title: "Profile deleted" });
          setDeleteConfirmId(null);
        },
        onError: () => toast({ title: "Failed to delete profile", variant: "destructive" }),
      }
    );
  }

  function handleDeleteCard(cardId: number) {
    deleteCreditCard.mutate(
      { id: cardId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCreditCardsQueryKey() });
          toast({ title: "Card removed" });
        },
        onError: () => toast({ title: "Failed to remove card", variant: "destructive" }),
      }
    );
  }

  function handleExport() {
    const data = JSON.stringify(profiles, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sniper-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${profiles.length} profiles` });
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        const items: Profile[] = Array.isArray(parsed) ? parsed : [parsed];
        const existingEmails = new Set(profiles.map((p) => p.email));
        let skipped = 0;
        let imported = 0;
        for (const p of items) {
          if (existingEmails.has(p.email)) {
            skipped++;
            continue;
          }
          await new Promise<void>((resolve) => {
            createProfile.mutate(
              {
                data: {
                  name: p.name,
                  email: p.email,
                  phone: p.phone ?? "",
                  shipFirstName: p.shipFirstName ?? "",
                  shipLastName: p.shipLastName ?? "",
                  shipAddress1: p.shipAddress1 ?? "",
                  shipAddress2: p.shipAddress2 ?? "",
                  shipCity: p.shipCity ?? "",
                  shipState: p.shipState ?? "",
                  shipZip: p.shipZip ?? "",
                  shipCountry: p.shipCountry ?? "US",
                  billSameAsShip: p.billSameAsShip ?? true,
                  billFirstName: p.billFirstName ?? "",
                  billLastName: p.billLastName ?? "",
                  billAddress1: p.billAddress1 ?? "",
                  billAddress2: p.billAddress2 ?? "",
                  billCity: p.billCity ?? "",
                  billState: p.billState ?? "",
                  billZip: p.billZip ?? "",
                  billCountry: p.billCountry ?? "US",
                  addressJigEnabled: p.addressJigEnabled ?? false,
                  costcoMembershipId: p.costcoMembershipId ?? "",
                },
              },
              { onSuccess: () => { imported++; resolve(); }, onError: () => resolve() }
            );
          });
        }
        queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
        toast({
          title: `Import complete`,
          description: `${imported} imported, ${skipped} skipped (duplicate email)`,
        });
      } catch {
        toast({ title: "Invalid JSON file", variant: "destructive" });
      }
      if (importRef.current) importRef.current.value = "";
    };
    reader.readAsText(file);
  }

  const addCardProfile = profiles.find((p) => p.id === addCardProfileId) ?? null;
  const addCardCards = allCards.filter((c) => c.profileId === addCardProfileId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Profiles</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {profiles.length} profile{profiles.length !== 1 ? "s" : ""} saved
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
            data-testid="input-import-file"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => importRef.current?.click()}
            data-testid="button-import-profiles"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={handleExport}
            disabled={profiles.length === 0}
            data-testid="button-export-profiles"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={openCreate}
            data-testid="button-create-profile"
          >
            <Plus className="w-4 h-4" /> New Profile
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {!isLoading && profiles.length === 0 && (
        <div className="py-16 text-center glass-card rounded-lg border border-border/50">
          <User className="w-12 h-12 mx-auto opacity-15 mb-4" />
          <p className="text-muted-foreground font-medium">No profiles yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1 mb-4">
            Create a profile to store your identity, address, and payment cards.
          </p>
          <Button size="sm" onClick={openCreate} data-testid="button-create-first-profile">
            <Plus className="w-4 h-4 mr-2" /> Create First Profile
          </Button>
        </div>
      )}

      {/* Profile grid */}
      {profiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {profiles.map((profile) => {
            const profileCards = allCards.filter((c) => c.profileId === profile.id);
            return (
              <ProfileCard
                key={profile.id}
                profile={profile}
                cards={profileCards}
                onEdit={() => openEdit(profile)}
                onDuplicate={() => handleDuplicate(profile)}
                onDelete={() => setDeleteConfirmId(profile.id)}
                onAddCard={() => setAddCardProfileId(profile.id)}
                onDeleteCard={handleDeleteCard}
              />
            );
          })}
        </div>
      )}

      {/* Profile form dialog */}
      <ProfileFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingProfile={editingProfile}
        onDone={() => setEditingProfile(null)}
      />

      {/* Add card dialog */}
      {addCardProfileId !== null && addCardProfile && (
        <AddCardDialog
          open={addCardProfileId !== null}
          onOpenChange={(open) => { if (!open) setAddCardProfileId(null); }}
          profileId={addCardProfileId}
          existingCardCount={addCardCards.length}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this profile and all its associated credit cards. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-profile">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId !== null && handleDelete(deleteConfirmId)}
              data-testid="button-confirm-delete-profile"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
