import { useState, useEffect, useRef, useCallback } from "react";
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
  exportProfiles,
  importProfiles,
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
  DialogDescription,
  DialogFooter,
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
import { Separator } from "@/components/ui/separator";
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
  Loader2,
  Search,
  AlertTriangle,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  Globe,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiBase } from "@/lib/api-base";

// ─── Schemas ────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  shipFirstName: z.string().optional(),
  shipLastName: z.string().optional(),
  shipAddress1: z.string().optional(),
  shipAddress2: z.string().optional(),
  shipCity: z.string().optional(),
  shipState: z.string().optional(),
  shipZip: z.string().optional(),
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
  samsMembershipId: z.string().optional(),
  imapHost: z.string().optional(),
  imapPort: z.string().optional(),
  imapUser: z.string().optional(),
  imapPassword: z.string().optional(),
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_PROFILE: ProfileFormValues = {
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
  samsMembershipId: "",
  imapHost: "",
  imapPort: "993",
  imapUser: "",
  imapPassword: "",
};

export function isProfileIncomplete(profile: Profile): boolean {
  return (
    !profile.shipFirstName ||
    !profile.shipLastName ||
    !profile.shipAddress1 ||
    !profile.shipCity ||
    !profile.shipState ||
    !profile.shipZip
  );
}

const CARD_TYPE_COLORS: Record<string, string> = {
  visa: "text-yellow-300",
  mastercard: "text-orange-400",
  amex: "text-green-400",
  discover: "text-yellow-400",
};
function cardTypeColor(type: string) {
  return CARD_TYPE_COLORS[type?.toLowerCase()] ?? "text-primary";
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b border-border/50 pb-2 mb-4">
      {children}
    </h3>
  );
}

// ─── Add Card inline form ─────────────────────────────────────────────────────

interface AddCardInlineProps {
  profileId: number;
  existingCount: number;
  onAdded: () => void;
}

function AddCardInline({ profileId, existingCount, onAdded }: AddCardInlineProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createCreditCard = useCreateCreditCard();

  const form = useForm<CreditCardFormValues>({
    resolver: zodResolver(creditCardSchema),
    defaultValues: { cardNickname: "", cardholderName: "", cardNumber: "", cvv: "", expiryMonth: "", expiryYear: "" },
  });

  function onSubmit(values: CreditCardFormValues) {
    createCreditCard.mutate(
      { data: { ...values, profileId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCreditCardsQueryKey() });
          toast({ title: "Card added" });
          setOpen(false);
          form.reset();
          onAdded();
        },
        onError: (err: unknown) => toast({ title: "Failed to add card", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      }
    );
  }

  if (existingCount >= 5) return null;

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full text-xs gap-1.5 border-dashed"
        onClick={() => setOpen(true)}
        data-testid={`button-add-card-inline-${profileId}`}
      >
        <Plus className="w-3.5 h-3.5" /> Add Payment Card
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 p-4 bg-muted/10 space-y-3">
      <p className="text-xs font-medium text-foreground/80">New Card</p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, () => toast({ title: "Please fill in all required card fields", variant: "destructive" }))} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="cardNickname" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Nickname</FormLabel>
                <FormControl><Input className="h-8 text-xs" placeholder="Main Visa" {...field} data-testid="input-card-nickname" /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name="cardholderName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Cardholder Name</FormLabel>
                <FormControl><Input className="h-8 text-xs" {...field} data-testid="input-cardholder-name" /></FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />
          </div>
          <FormField control={form.control} name="cardNumber" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs">Card Number</FormLabel>
              <FormControl><Input className="h-8 text-xs font-mono" placeholder="•••• •••• •••• ••••" maxLength={19} {...field} data-testid="input-card-number" /></FormControl>
              <FormMessage className="text-[10px]" />
            </FormItem>
          )} />
          <div className="grid grid-cols-3 gap-3">
            <FormField control={form.control} name="expiryMonth" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Month</FormLabel>
                <FormControl><Input className="h-8 text-xs" placeholder="MM" maxLength={2} {...field} data-testid="input-expiry-month" /></FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />
            <FormField control={form.control} name="expiryYear" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Year</FormLabel>
                <FormControl><Input className="h-8 text-xs" placeholder="YY" maxLength={4} {...field} data-testid="input-expiry-year" /></FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />
            <FormField control={form.control} name="cvv" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">CVV</FormLabel>
                <FormControl><Input className="h-8 text-xs" type="password" maxLength={4} {...field} data-testid="input-cvv" /></FormControl>
                <FormMessage className="text-[10px]" />
              </FormItem>
            )} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { setOpen(false); form.reset(); }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="flex-1 text-xs" disabled={createCreditCard.isPending} data-testid="button-add-card-submit">
              {createCreditCard.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Card"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

// ─── Profile Form Dialog ──────────────────────────────────────────────────────

interface ProfileFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProfile: Profile | null;
  profileCards: CreditCard[];
  onDone: () => void;
}

function ProfileFormDialog({
  open,
  onOpenChange,
  editingProfile,
  profileCards,
  onDone,
}: ProfileFormDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const deleteCreditCard = useDeleteCreditCard();

  const [deleteCardConfirmId, setDeleteCardConfirmId] = useState<number | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: EMPTY_PROFILE,
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
        samsMembershipId: editingProfile.samsMembershipId ?? "",
        imapHost: editingProfile.imapHost ?? "",
        imapPort: editingProfile.imapPort ?? "993",
        imapUser: editingProfile.imapUser ?? "",
        imapPassword: editingProfile.imapPassword ?? "",
      });
    } else {
      form.reset(EMPTY_PROFILE);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingProfile?.id]);

  function handleDeleteCard(cardId: number) {
    setDeleteCardConfirmId(cardId);
  }

  function confirmDeleteCard() {
    if (deleteCardConfirmId === null) return;
    deleteCreditCard.mutate(
      { id: deleteCardConfirmId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCreditCardsQueryKey() });
          setDeleteCardConfirmId(null);
        },
        onError: (err: unknown) => {
          toast({ title: "Failed to remove card", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
          setDeleteCardConfirmId(null);
        },
      }
    );
  }

  function onSubmit(values: ProfileFormValues) {
    const data = {
      ...values,
      phone: values.phone ?? "",
      shipAddress2: values.shipAddress2 ?? "",
      costcoMembershipId: values.costcoMembershipId ?? "",
      samsMembershipId: values.samsMembershipId ?? "",
      imapHost: values.imapHost ?? "",
      imapPort: values.imapPort ?? "993",
      imapUser: values.imapUser ?? "",
      imapPassword: values.imapPassword ?? "",
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
          onError: (err: unknown) => toast({ title: "Failed to update profile", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
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
            form.reset(EMPTY_PROFILE);
          },
          onError: (err: unknown) => toast({ title: "Failed to create profile", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
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
          <form onSubmit={form.handleSubmit(onSubmit, () => toast({ title: "Please fill in all required fields", description: "Check the fields highlighted in red.", variant: "destructive" }))} className="space-y-6">
            {/* Identity */}
            <div>
              <SectionHeader>Identity</SectionHeader>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Profile Name</FormLabel>
                    <FormControl><Input placeholder="My Main Profile" {...field} data-testid="input-profile-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="john@example.com" {...field} data-testid="input-profile-email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input placeholder="555-555-5555" {...field} data-testid="input-profile-phone" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="costcoMembershipId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Costco Membership ID <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="Optional" {...field} data-testid="input-costco-membership" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="samsMembershipId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sam's Club Membership ID <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="Optional" {...field} data-testid="input-sams-membership" /></FormControl>
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
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-bill-same-as-ship" />
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

            {/* Payment Methods (edit mode) */}
            {isEditing && editingProfile && (
              <div>
                <SectionHeader>
                  Payment Methods ({profileCards.length}/5 slots)
                </SectionHeader>

                {profileCards.length === 0 && (
                  <p className="text-xs text-muted-foreground mb-3">No cards saved for this profile.</p>
                )}

                <div className="space-y-2 mb-3">
                  {profileCards.map((card) => (
                    <div
                      key={card.id}
                      className="flex items-center justify-between gap-2 bg-muted/20 rounded-md px-3 py-2 border border-border/30 group/card"
                      data-testid={`card-slot-${card.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-mono font-semibold text-xs ${cardTypeColor(card.cardType)}`}>
                          {card.cardType ? card.cardType.toUpperCase() : "CARD"}
                        </span>
                        <span className="font-mono text-xs">••••&nbsp;{card.lastFour}</span>
                        {card.cardNickname && (
                          <span className="text-muted-foreground text-[11px] truncate">({card.cardNickname})</span>
                        )}
                        <span className="text-muted-foreground text-[11px]">{card.expiryMonth}/{card.expiryYear}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover/card:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        onClick={() => handleDeleteCard(card.id)}
                        data-testid={`button-delete-card-slot-${card.id}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <AddCardInline
                  profileId={editingProfile.id}
                  existingCount={profileCards.length}
                  onAdded={() => {}}
                />
              </div>
            )}

            {/* Options */}
            <div>
              <SectionHeader>Options</SectionHeader>
              <FormField control={form.control} name="addressJigEnabled" render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 rounded-lg border border-border/50 p-4 bg-muted/10">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-address-jig" />
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

            {/* IMAP / Email */}
            <div>
              <SectionHeader>
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  IMAP / Email
                </span>
              </SectionHeader>
              <p className="text-xs text-muted-foreground mb-4">
                IMAP account is used to intercept OTP codes for tasks that don't have a profile-specific inbox configured. Each profile can override this with its own email in the profile editor. We recommend a dedicated Gmail account — use imap.gmail.com port 993 with an App Password (enable 2-Step Verification first, then generate the App Password).
              </p>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="imapHost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IMAP Host</FormLabel>
                    <FormControl><Input placeholder="imap.gmail.com" {...field} data-testid="input-profile-imap-host" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="imapPort" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IMAP Port</FormLabel>
                    <FormControl><Input placeholder="993" {...field} data-testid="input-profile-imap-port" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="imapUser" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl><Input type="email" placeholder="bot@gmail.com" {...field} data-testid="input-profile-imap-user" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="imapPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:underline"
                        style={{ color: "var(--appearance-color)" }}
                      >
                        App Password ↗
                      </a>
                    </FormLabel>
                    <FormControl><Input type="password" placeholder="xxxx xxxx xxxx xxxx" {...field} data-testid="input-profile-imap-password" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            <Separator />

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} data-testid="button-cancel-profile">
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isPending} data-testid="button-save-profile">
                {isPending ? "Saving..." : isEditing ? "Save Changes" : "Create Profile"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      {/* Card removal confirmation */}
      <AlertDialog
        open={deleteCardConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteCardConfirmId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Card?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const card = profileCards.find((c) => c.id === deleteCardConfirmId);
                return card
                  ? `Remove ••••\u00a0${card.lastFour} from this profile? This cannot be undone.`
                  : "Remove this card from the profile? This cannot be undone.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-card-dialog">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteCard}
              data-testid="button-confirm-delete-card-dialog"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

// ─── Profile Card ─────────────────────────────────────────────────────────────

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
            <CardTitle className="text-base truncate" title={profile.name}>{profile.name}</CardTitle>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{profile.email}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" data-testid={`button-menu-profile-${profile.id}`}>
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
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete} data-testid={`menu-delete-profile-${profile.id}`}>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {isProfileIncomplete(profile) && (
            <Badge variant="outline" className="text-[var(--appearance-color)] text-[10px] gap-1" style={{ borderColor: "color-mix(in srgb, var(--appearance-color) 40%, transparent)", background: "color-mix(in srgb, var(--appearance-color) 12%, transparent)" }}>
              <AlertTriangle className="w-2.5 h-2.5" /> Incomplete
            </Badge>
          )}
          {profile.addressJigEnabled && (
            <Badge variant="outline" className="text-[var(--appearance-color)] text-[10px] gap-1" style={{ borderColor: "color-mix(in srgb, var(--appearance-color) 30%, transparent)", background: "color-mix(in srgb, var(--appearance-color) 8%, transparent)" }}>
              <Zap className="w-2.5 h-2.5" /> Jig On
            </Badge>
          )}
          {profile.costcoMembershipId && (
            <Badge variant="outline" className="text-yellow-300 border-yellow-400/20 bg-yellow-400/5 text-[10px]">Costco</Badge>
          )}
          {profile.samsMembershipId && (
            <Badge variant="outline" className="text-blue-300 border-blue-400/20 bg-blue-400/5 text-[10px]">Sam's Club</Badge>
          )}
          {profile.imapUser && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-green-400 border-green-500/20 bg-green-500/10 text-[10px] gap-1 cursor-default">
                  <Mail className="w-2.5 h-2.5" /> IMAP
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{profile.imapUser}</TooltipContent>
            </Tooltip>
          )}
          <Badge variant="outline" className="text-[10px]">
            <CreditCardIcon className="w-2.5 h-2.5 mr-1" />{cards.length}/5 cards
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
                  <span className={`font-mono font-semibold text-[11px] ${cardTypeColor(card.cardType)}`}>
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

// ─── Add Card Dialog (standalone, for card list action) ───────────────────────

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
    defaultValues: { cardNickname: "", cardholderName: "", cardNumber: "", cvv: "", expiryMonth: "", expiryYear: "" },
  });

  useEffect(() => {
    if (!open) form.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        },
        onError: (err: unknown) => toast({ title: "Failed to add card", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
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
            <form onSubmit={form.handleSubmit(onSubmit, () => toast({ title: "Please fill in all required card fields", variant: "destructive" }))} className="space-y-4">
              <FormField control={form.control} name="cardNickname" render={({ field }) => (
                <FormItem>
                  <FormLabel>Card Nickname <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="Main Visa" {...field} data-testid="input-card-nickname" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="cardholderName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cardholder Name</FormLabel>
                  <FormControl><Input placeholder="John Doe" {...field} data-testid="input-cardholder-name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="cardNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Card Number</FormLabel>
                  <FormControl><Input placeholder="•••• •••• •••• ••••" maxLength={19} {...field} data-testid="input-card-number" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="expiryMonth" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Month</FormLabel>
                    <FormControl><Input placeholder="MM" maxLength={2} {...field} data-testid="input-expiry-month" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="expiryYear" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year</FormLabel>
                    <FormControl><Input placeholder="YY" maxLength={4} {...field} data-testid="input-expiry-year" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cvv" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CVV</FormLabel>
                    <FormControl><Input type="password" maxLength={4} {...field} data-testid="input-cvv" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <Button type="submit" className="w-full" disabled={createCreditCard.isPending} data-testid="button-add-card-submit">
                {createCreditCard.isPending ? "Adding..." : "Add Card"}
              </Button>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Retailer Accounts Dialog ────────────────────────────────────────────────

const SUPPORTED_RETAILERS = [
  "Amazon",
  "Walmart",
  "Best Buy",
  "Target",
  "Costco",
  "Sam's Club",
  "Pokemon Center",
] as const;

/** URL opened in the native BrowserWindow for each retailer's login page. */
const RETAILER_LOGIN_URLS: Record<string, string> = {
  "Amazon":         "https://www.amazon.com/ap/signin",
  "Walmart":        "https://www.walmart.com/account/login",
  "Best Buy":       "https://www.bestbuy.com/identity/global/signin",
  "Target":         "https://www.target.com/account",
  "Costco":         "https://www.costco.com/LogonForm",
  "Sam's Club":     "https://www.samsclub.com/account/sign-in",
  "Pokemon Center": "https://www.pokemoncenter.com/account/login",
};

/** Cookie extraction URLs per retailer — we pull cookies from these URLs after login. */
const RETAILER_COOKIE_URLS: Record<string, string[]> = {
  "Amazon":         ["https://www.amazon.com"],
  "Walmart":        ["https://www.walmart.com"],
  "Best Buy":       ["https://www.bestbuy.com"],
  "Target":         ["https://www.target.com"],
  "Costco":         ["https://www.costco.com"],
  "Sam's Club":     ["https://www.samsclub.com"],
  "Pokemon Center": ["https://www.pokemoncenter.com"],
};

interface RetailerAccount {
  id: number;
  retailer: string;
  profileId: number;
  email: string;
  createdAt: string;
  sessionActive: boolean;
}

interface RetailerAccountsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: { id: number; name: string }[];
}

function RetailerAccountsDialog({ open, onOpenChange, profiles }: RetailerAccountsDialogProps) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<RetailerAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [loggingIn, setLoggingIn] = useState<Set<number>>(new Set());
  const [loginFailed, setLoginFailed] = useState<Set<number>>(new Set());
  const [manualLoggingIn, setManualLoggingIn] = useState<Set<number>>(new Set());
  const [browserLoginId, setBrowserLoginId] = useState<number | null>(null);
  const [savingBrowserSession, setSavingBrowserSession] = useState(false);

  // Form state for add/edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formRetailer, setFormRetailer] = useState(SUPPORTED_RETAILERS[0] as string);
  const [formProfileId, setFormProfileId] = useState<number | "">("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [showForm, setShowForm] = useState(false);

  const apiBase = getApiBase();

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/retailer-accounts`);
      if (!res.ok) throw new Error("Failed to fetch");
      setAccounts(await res.json());
    } catch {
      toast({ title: "Failed to load accounts", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiBase, toast]);

  const triggerLogin = useCallback(async (id: number, retailer: string) => {
    setLoggingIn((prev) => new Set([...prev, id]));
    try {
      const res = await fetch(`${apiBase}/api/retailer-accounts/${id}/login`, { method: "POST" });
      const data = await res.json() as { success: boolean; message: string };
      if (data.success) {
        toast({ title: `${retailer} — signed in`, description: "Session cached — login will be skipped at checkout" });
        setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, sessionActive: true } : a));
        setLoginFailed((prev) => { const s = new Set(prev); s.delete(id); return s; });
      } else {
        toast({ title: `${retailer} — sign-in failed`, description: data.message ?? "Try signing in manually instead.", variant: "destructive" });
        setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, sessionActive: false } : a));
        setLoginFailed((prev) => new Set([...prev, id]));
      }
    } catch {
      toast({ title: "Sign-in request failed", variant: "destructive" });
      setLoginFailed((prev) => new Set([...prev, id]));
    } finally {
      setLoggingIn((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [apiBase, toast]);

  const triggerBrowserLogin = useCallback(async (acct: RetailerAccount) => {
    const electronAPI = (window as Window & { electronAPI?: { retailer?: { openLoginWindow: (id: number, url: string, retailer: string) => Promise<{ ok: boolean; error?: string }> } } }).electronAPI;
    if (!electronAPI?.retailer) {
      toast({ title: "Browser Login is only available in the desktop app", variant: "destructive" });
      return;
    }
    const loginUrl = RETAILER_LOGIN_URLS[acct.retailer] ?? `https://www.${acct.retailer.toLowerCase().replace(/\s+/g, "")}.com`;
    const result = await electronAPI.retailer.openLoginWindow(acct.id, loginUrl, acct.retailer);
    if (result.ok) {
      setBrowserLoginId(acct.id);
      setLoginFailed((prev) => { const s = new Set(prev); s.delete(acct.id); return s; });
    } else {
      toast({ title: `Couldn't open browser window`, description: result.error, variant: "destructive" });
    }
  }, [toast]);

  const saveBrowserSession = useCallback(async (acct: RetailerAccount) => {
    const electronAPI = (window as Window & { electronAPI?: { retailer?: { extractCookies: (id: number, urls: string[]) => Promise<{ ok: boolean; cookies?: unknown[]; error?: string }> } } }).electronAPI;
    if (!electronAPI?.retailer) return;

    setSavingBrowserSession(true);
    try {
      const cookieUrls = RETAILER_COOKIE_URLS[acct.retailer] ?? [`https://www.${acct.retailer.toLowerCase().replace(/\s+/g, "")}.com`];
      const result = await electronAPI.retailer.extractCookies(acct.id, cookieUrls);
      if (!result.ok) {
        toast({ title: "Couldn't extract cookies", description: result.error, variant: "destructive" });
        return;
      }

      const res = await fetch(`${apiBase}/api/retailer-accounts/${acct.id}/import-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies: result.cookies }),
      });
      const data = await res.json() as { success?: boolean; message?: string; error?: string };
      if (data.success) {
        toast({ title: `${acct.retailer} — session saved`, description: data.message ?? "Login will be skipped at checkout." });
        setAccounts((prev) => prev.map((a) => a.id === acct.id ? { ...a, sessionActive: true } : a));
        setBrowserLoginId(null);
      } else {
        toast({ title: "Session import failed", description: data.error ?? "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Session import failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSavingBrowserSession(false);
    }
  }, [apiBase, toast]);

  const cancelBrowserLogin = useCallback(async (acctId: number) => {
    const electronAPI = (window as Window & { electronAPI?: { retailer?: { closeLoginWindow: (id: number) => Promise<{ ok: boolean }> } } }).electronAPI;
    await electronAPI?.retailer?.closeLoginWindow(acctId);
    setBrowserLoginId(null);
  }, []);

  const triggerManualLogin = useCallback(async (id: number, retailer: string) => {
    setManualLoggingIn((prev) => new Set([...prev, id]));
    try {
      const res = await fetch(`${apiBase}/api/retailer-accounts/${id}/manual-login`, { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      if (data.ok) {
        // LoginAssistModal will appear automatically once it polls and sees the active session
        toast({ title: `${retailer} — browser opening…`, description: "Complete the sign-in, then click 'I'm Signed In' in the popup." });
        setLoginFailed((prev) => { const s = new Set(prev); s.delete(id); return s; });
      } else {
        toast({ title: `${retailer} — couldn't open browser`, description: data.error ?? "Unknown error", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to start manual login", variant: "destructive" });
    } finally {
      setManualLoggingIn((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [apiBase, toast]);

  useEffect(() => {
    if (open) fetchAccounts();
  }, [open, fetchAccounts]);

  function resetForm() {
    setEditingId(null);
    setFormRetailer(SUPPORTED_RETAILERS[0]);
    setFormProfileId("");
    setFormEmail("");
    setFormPassword("");
    setShowForm(false);
    setShowPasswords({});
  }

  function openAdd() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(acct: RetailerAccount) {
    setEditingId(acct.id);
    setFormRetailer(acct.retailer);
    setFormProfileId(acct.profileId);
    setFormEmail(acct.email);
    setFormPassword("");
    setShowForm(true);
  }

  async function handleSave() {
    if (!formRetailer || !formProfileId || !formEmail || (!editingId && !formPassword)) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        retailer: formRetailer,
        profileId: Number(formProfileId),
        email: formEmail,
      };
      if (formPassword) body.password = formPassword;

      let res: Response;
      if (editingId) {
        res = await fetch(`${apiBase}/api/retailer-accounts/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${apiBase}/api/retailer-accounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json() as RetailerAccount;
      toast({ title: editingId ? "Account updated — signing in..." : "Account saved — signing in..." });
      resetForm();
      fetchAccounts();
      // Auto-login in background to pre-warm the session cache
      triggerLogin(saved.id, saved.retailer);
    } catch (e) {
      toast({ title: "Failed to save account", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`${apiBase}/api/retailer-accounts/${id}`, { method: "DELETE" });
      toast({ title: "Account removed" });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast({ title: "Failed to delete account", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  function toggleShow(key: number | "new") {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const profileName = (id: number) => profiles.find((p) => p.id === id)?.name ?? `Profile #${id}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Retailer Accounts
          </DialogTitle>
          <DialogDescription>
            Store login credentials per retailer and profile. Passwords are encrypted at rest.
          </DialogDescription>
        </DialogHeader>

        {/* Browser login in-progress banner */}
        {browserLoginId !== null && (
          <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 text-xs text-blue-300">
            <Globe className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-400" />
            <div className="space-y-0.5">
              <p className="font-medium">Browser window is open — sign in now</p>
              <p className="text-blue-300/70">Complete the sign-in in the browser window, then click <span className="font-medium text-green-400">Save Session</span> on the account row below.</p>
            </div>
          </div>
        )}

        {/* Existing accounts */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : accounts.length === 0 && !showForm ? (
            <p className="text-xs text-muted-foreground text-center py-6">No accounts saved yet.</p>
          ) : (
            accounts.map((acct) => {
              const isLoggingIn = loggingIn.has(acct.id);
              const isFailed = loginFailed.has(acct.id);
              const isManualLoggingIn = manualLoggingIn.has(acct.id);
              return (
                <div key={acct.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 bg-muted/10 ${isFailed ? "border-orange-500/40 bg-orange-500/5" : "border-border/50"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {/* Session status dot */}
                      {isLoggingIn ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin text-muted-foreground shrink-0" />
                      ) : (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${acct.sessionActive ? "bg-green-500" : isFailed ? "bg-orange-500" : "bg-red-500"}`}
                          title={acct.sessionActive ? "Session active — login cached" : isFailed ? "Auto sign-in failed — sign in manually" : "Not signed in"}
                        />
                      )}
                      <span className="text-xs font-medium text-foreground">{acct.retailer}</span>
                      <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{profileName(acct.profileId)}</span>
                      {isFailed && (
                        <span className="text-[10px] text-orange-400 font-medium">sign-in failed</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 pl-4">{acct.email}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Browser Login — always visible; shown prominently when auto-login fails */}
                    {browserLoginId === acct.id ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                          onClick={() => saveBrowserSession(acct)}
                          disabled={savingBrowserSession}
                          title="Extract cookies and save session"
                        >
                          {savingBrowserSession
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <CheckCircle2 className="w-3 h-3" />}
                          Save Session
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => cancelBrowserLogin(acct.id)}
                          disabled={savingBrowserSession}
                          title="Cancel browser login"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        {isFailed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                            onClick={() => triggerManualLogin(acct.id, acct.retailer)}
                            disabled={isManualLoggingIn}
                            title="Sign in manually using a bot-controlled browser"
                          >
                            {isManualLoggingIn
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <KeyRound className="w-3 h-3" />}
                            Manual
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 px-2 text-[11px] gap-1 ${isFailed ? "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10" : "text-muted-foreground hover:text-foreground"}`}
                          onClick={() => triggerBrowserLogin(acct)}
                          title="Open your real browser to sign in (best for Costco and sites that block bots)"
                        >
                          <Globe className="w-3 h-3" />
                          Browser
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => triggerLogin(acct.id, acct.retailer)}
                      disabled={isLoggingIn}
                      title={acct.sessionActive ? "Re-authenticate" : "Sign in"}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoggingIn ? "animate-spin" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(acct)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(acct.id)}
                      disabled={deletingId === acct.id}
                      title="Delete"
                    >
                      {deletingId === acct.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <div className="rounded-lg border border-border/50 p-4 bg-muted/10 space-y-3 mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {editingId ? "Edit Account" : "Add Account"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Retailer</label>
                <select
                  value={formRetailer}
                  onChange={(e) => setFormRetailer(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SUPPORTED_RETAILERS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Profile</label>
                <select
                  value={formProfileId}
                  onChange={(e) => setFormProfileId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select profile…</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Email / Username</label>
              <Input
                className="h-8 text-xs"
                type="email"
                placeholder="user@example.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Password {editingId && <span className="text-muted-foreground/60">(leave blank to keep current)</span>}
              </label>
              <div className="relative">
                <Input
                  className="h-8 text-xs pr-8"
                  type={showPasswords["new"] ? "text" : "password"}
                  placeholder={editingId ? "••••••••" : "Required"}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => toggleShow("new")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPasswords["new"] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                {editingId ? "Update" : "Save"}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm} disabled={saving}>Cancel</Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 mt-2">
          {!showForm ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5" /> Add Account
            </Button>
          ) : <div />}
          <Button size="sm" variant="ghost" onClick={() => { resetForm(); onOpenChange(false); }}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
  const [deleteCardConfirmId, setDeleteCardConfirmId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  function openCreate() { setEditingProfile(null); setFormOpen(true); }
  function openEdit(profile: Profile) { setEditingProfile(profile); setFormOpen(true); }

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
          samsMembershipId: profile.samsMembershipId ?? "",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
          toast({ title: "Profile duplicated" });
        },
        onError: (err: unknown) => toast({ title: "Failed to duplicate profile", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
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
        onError: (err: unknown) => toast({ title: "Failed to delete profile", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      }
    );
  }

  function handleDeleteCard(cardId: number) {
    setDeleteCardConfirmId(cardId);
  }

  function confirmDeleteCard() {
    if (deleteCardConfirmId === null) return;
    deleteCreditCard.mutate(
      { id: deleteCardConfirmId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCreditCardsQueryKey() });
          toast({ title: "Card removed" });
          setDeleteCardConfirmId(null);
        },
        onError: (err: unknown) => {
          toast({ title: "Failed to remove card", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
          setDeleteCardConfirmId(null);
        },
      }
    );
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportProfiles();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sniper-profiles-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${data.profiles.length} profile(s) with card data` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as unknown;
        const profilesArr: unknown[] = Array.isArray(raw)
          ? raw
          : ((raw as Record<string, unknown>).profiles as unknown[] ?? []);
        const cardsArr: unknown[] = Array.isArray(raw)
          ? []
          : ((raw as Record<string, unknown>).cards as unknown[] ?? []);

        const result = await importProfiles({ profiles: profilesArr, cards: cardsArr });
        queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListCreditCardsQueryKey() });
        toast({
          title: "Import complete",
          description: `${result.upserted} profile(s) upserted, ${result.cardsImported} card(s) restored`,
        });
      } catch {
        toast({ title: "Import failed — invalid JSON or server error", variant: "destructive" });
      } finally {
        setImporting(false);
        if (importRef.current) importRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  const addCardProfile = profiles.find((p) => p.id === addCardProfileId) ?? null;
  const addCardCards = allCards.filter((c) => c.profileId === addCardProfileId);

  const q = searchQuery.trim().toLowerCase();
  const filteredProfiles = q
    ? profiles.filter((p) => {
        if (p.name.toLowerCase().includes(q)) return true;
        if (p.email.toLowerCase().includes(q)) return true;
        const cards = allCards.filter((c) => c.profileId === p.id);
        return cards.some(
          (c) =>
            c.cardholderName.toLowerCase().includes(q) ||
            (c.cardNickname ?? "").toLowerCase().includes(q)
        );
      })
    : profiles;

  const deleteCardConfirmCard = allCards.find((c) => c.id === deleteCardConfirmId) ?? null;

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
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} data-testid="input-import-file" />
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => importRef.current?.click()} disabled={importing} data-testid="button-import-profiles">
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Import
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={handleExport} disabled={profiles.length === 0 || exporting} data-testid="button-export-profiles">
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setAccountsOpen(true)} data-testid="button-open-accounts">
            <KeyRound className="w-3.5 h-3.5" /> Accounts
          </Button>
          <Button size="sm" className="gap-2" onClick={openCreate} data-testid="button-create-profile">
            <Plus className="w-4 h-4" /> New Profile
          </Button>
        </div>
      </div>

      {/* Search */}
      {profiles.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search by name, email, or cardholder…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-profiles"
          />
        </div>
      )}

      {/* Empty state — no profiles at all */}
      {!isLoading && profiles.length === 0 && (
        <div className="py-16 text-center glass-card rounded-lg border border-border/50">
          <User className="w-12 h-12 mx-auto opacity-15 mb-4" />
          <p className="text-muted-foreground font-medium">No profiles yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1 mb-4">
            Create a profile to store identity, address, and payment cards.
          </p>
          <Button size="sm" onClick={openCreate} data-testid="button-create-first-profile">
            <Plus className="w-4 h-4 mr-2" /> Create First Profile
          </Button>
        </div>
      )}

      {/* No search results */}
      {profiles.length > 0 && filteredProfiles.length === 0 && (
        <div className="py-12 text-center glass-card rounded-lg border border-border/50">
          <Search className="w-10 h-10 mx-auto opacity-15 mb-3" />
          <p className="text-muted-foreground font-medium">No profiles match "{searchQuery}"</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Try a different name, email, or cardholder name.</p>
        </div>
      )}

      {/* Profile grid */}
      {filteredProfiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filteredProfiles.map((profile) => {
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

      {/* Profile form dialog (create / edit with card slots) */}
      <ProfileFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingProfile={editingProfile}
        profileCards={editingProfile ? allCards.filter((c) => c.profileId === editingProfile.id) : []}
        onDone={() => setEditingProfile(null)}
      />

      {/* Standalone add-card dialog (from card list button) */}
      {addCardProfileId !== null && addCardProfile && (
        <AddCardDialog
          open={addCardProfileId !== null}
          onOpenChange={(open) => { if (!open) setAddCardProfileId(null); }}
          profileId={addCardProfileId}
          existingCardCount={addCardCards.length}
        />
      )}

      {/* Delete profile confirm */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this profile and all its associated credit cards. This cannot be undone.
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

      {/* Delete card confirm (from profile card grid) */}
      <AlertDialog
        open={deleteCardConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteCardConfirmId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Card?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCardConfirmCard
                ? `Remove ••••\u00a0${deleteCardConfirmCard.lastFour} from this profile? This cannot be undone.`
                : "Remove this card from the profile? This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-card">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteCard}
              data-testid="button-confirm-delete-card"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RetailerAccountsDialog
        open={accountsOpen}
        onOpenChange={setAccountsOpen}
        profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
