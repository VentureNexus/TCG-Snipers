import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { AnalyticsSummary, BulkActionResult, CheckoutResult, CheckoutTimeSeriesPoint, CreateCheckoutResultBody, CreateCreditCardBody, CreateProfileBody, CreateProxyBody, CreateTaskBody, CreateTaskGroupBody, CreditCard, GetCheckoutsOverTimeParams, HealthStatus, ListCheckoutResultsParams, ListCreditCardsParams, ListTasksParams, Profile, ProfileExportData, ProfileImportBody, ProfileImportResult, Proxy, ProxyTestResult, Settings, Task, TaskGroup, UpdateCheckoutResultBody, UpdateCreditCardBody, UpdateProfileBody, UpdateProxyBody, UpdateSettingsBody, UpdateTaskBody, UpdateTaskGroupBody } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * Returns server health status
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get application settings
 */
export declare const getGetSettingsUrl: () => string;
export declare const getSettings: (options?: RequestInit) => Promise<Settings>;
export declare const getGetSettingsQueryKey: () => readonly ["/api/settings"];
export declare const getGetSettingsQueryOptions: <TData = Awaited<ReturnType<typeof getSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetSettingsQueryResult = NonNullable<Awaited<ReturnType<typeof getSettings>>>;
export type GetSettingsQueryError = ErrorType<unknown>;
/**
 * @summary Get application settings
 */
export declare function useGetSettings<TData = Awaited<ReturnType<typeof getSettings>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getSettings>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update application settings
 */
export declare const getUpdateSettingsUrl: () => string;
export declare const updateSettings: (updateSettingsBody: UpdateSettingsBody, options?: RequestInit) => Promise<Settings>;
export declare const getUpdateSettingsMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
        data: BodyType<UpdateSettingsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
    data: BodyType<UpdateSettingsBody>;
}, TContext>;
export type UpdateSettingsMutationResult = NonNullable<Awaited<ReturnType<typeof updateSettings>>>;
export type UpdateSettingsMutationBody = BodyType<UpdateSettingsBody>;
export type UpdateSettingsMutationError = ErrorType<unknown>;
/**
 * @summary Update application settings
 */
export declare const useUpdateSettings: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateSettings>>, TError, {
        data: BodyType<UpdateSettingsBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateSettings>>, TError, {
    data: BodyType<UpdateSettingsBody>;
}, TContext>;
/**
 * @summary Export all profiles with encrypted card data
 */
export declare const getExportProfilesUrl: () => string;
export declare const exportProfiles: (options?: RequestInit) => Promise<ProfileExportData>;
export declare const getExportProfilesQueryKey: () => readonly ["/api/profiles/export"];
export declare const getExportProfilesQueryOptions: <TData = Awaited<ReturnType<typeof exportProfiles>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof exportProfiles>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof exportProfiles>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ExportProfilesQueryResult = NonNullable<Awaited<ReturnType<typeof exportProfiles>>>;
export type ExportProfilesQueryError = ErrorType<unknown>;
/**
 * @summary Export all profiles with encrypted card data
 */
export declare function useExportProfiles<TData = Awaited<ReturnType<typeof exportProfiles>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof exportProfiles>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Import profiles and restore encrypted card data
 */
export declare const getImportProfilesUrl: () => string;
export declare const importProfiles: (profileImportBody: ProfileImportBody, options?: RequestInit) => Promise<ProfileImportResult>;
export declare const getImportProfilesMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof importProfiles>>, TError, {
        data: BodyType<ProfileImportBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof importProfiles>>, TError, {
    data: BodyType<ProfileImportBody>;
}, TContext>;
export type ImportProfilesMutationResult = NonNullable<Awaited<ReturnType<typeof importProfiles>>>;
export type ImportProfilesMutationBody = BodyType<ProfileImportBody>;
export type ImportProfilesMutationError = ErrorType<unknown>;
/**
 * @summary Import profiles and restore encrypted card data
 */
export declare const useImportProfiles: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof importProfiles>>, TError, {
        data: BodyType<ProfileImportBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof importProfiles>>, TError, {
    data: BodyType<ProfileImportBody>;
}, TContext>;
/**
 * @summary List all profiles
 */
export declare const getListProfilesUrl: () => string;
export declare const listProfiles: (options?: RequestInit) => Promise<Profile[]>;
export declare const getListProfilesQueryKey: () => readonly ["/api/profiles"];
export declare const getListProfilesQueryOptions: <TData = Awaited<ReturnType<typeof listProfiles>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProfiles>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listProfiles>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListProfilesQueryResult = NonNullable<Awaited<ReturnType<typeof listProfiles>>>;
export type ListProfilesQueryError = ErrorType<unknown>;
/**
 * @summary List all profiles
 */
export declare function useListProfiles<TData = Awaited<ReturnType<typeof listProfiles>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProfiles>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a profile
 */
export declare const getCreateProfileUrl: () => string;
export declare const createProfile: (createProfileBody: CreateProfileBody, options?: RequestInit) => Promise<Profile>;
export declare const getCreateProfileMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProfile>>, TError, {
        data: BodyType<CreateProfileBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createProfile>>, TError, {
    data: BodyType<CreateProfileBody>;
}, TContext>;
export type CreateProfileMutationResult = NonNullable<Awaited<ReturnType<typeof createProfile>>>;
export type CreateProfileMutationBody = BodyType<CreateProfileBody>;
export type CreateProfileMutationError = ErrorType<unknown>;
/**
 * @summary Create a profile
 */
export declare const useCreateProfile: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProfile>>, TError, {
        data: BodyType<CreateProfileBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createProfile>>, TError, {
    data: BodyType<CreateProfileBody>;
}, TContext>;
/**
 * @summary Get a profile by ID
 */
export declare const getGetProfileUrl: (id: number) => string;
export declare const getProfile: (id: number, options?: RequestInit) => Promise<Profile>;
export declare const getGetProfileQueryKey: (id: number) => readonly [`/api/profiles/${number}`];
export declare const getGetProfileQueryOptions: <TData = Awaited<ReturnType<typeof getProfile>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProfile>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProfile>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProfileQueryResult = NonNullable<Awaited<ReturnType<typeof getProfile>>>;
export type GetProfileQueryError = ErrorType<void>;
/**
 * @summary Get a profile by ID
 */
export declare function useGetProfile<TData = Awaited<ReturnType<typeof getProfile>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProfile>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update a profile
 */
export declare const getUpdateProfileUrl: (id: number) => string;
export declare const updateProfile: (id: number, updateProfileBody: UpdateProfileBody, options?: RequestInit) => Promise<Profile>;
export declare const getUpdateProfileMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProfile>>, TError, {
        id: number;
        data: BodyType<UpdateProfileBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateProfile>>, TError, {
    id: number;
    data: BodyType<UpdateProfileBody>;
}, TContext>;
export type UpdateProfileMutationResult = NonNullable<Awaited<ReturnType<typeof updateProfile>>>;
export type UpdateProfileMutationBody = BodyType<UpdateProfileBody>;
export type UpdateProfileMutationError = ErrorType<void>;
/**
 * @summary Update a profile
 */
export declare const useUpdateProfile: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProfile>>, TError, {
        id: number;
        data: BodyType<UpdateProfileBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateProfile>>, TError, {
    id: number;
    data: BodyType<UpdateProfileBody>;
}, TContext>;
/**
 * @summary Delete a profile
 */
export declare const getDeleteProfileUrl: (id: number) => string;
export declare const deleteProfile: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteProfileMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProfile>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteProfile>>, TError, {
    id: number;
}, TContext>;
export type DeleteProfileMutationResult = NonNullable<Awaited<ReturnType<typeof deleteProfile>>>;
export type DeleteProfileMutationError = ErrorType<unknown>;
/**
 * @summary Delete a profile
 */
export declare const useDeleteProfile: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProfile>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteProfile>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary List credit cards
 */
export declare const getListCreditCardsUrl: (params?: ListCreditCardsParams) => string;
export declare const listCreditCards: (params?: ListCreditCardsParams, options?: RequestInit) => Promise<CreditCard[]>;
export declare const getListCreditCardsQueryKey: (params?: ListCreditCardsParams) => readonly ["/api/credit-cards", ...ListCreditCardsParams[]];
export declare const getListCreditCardsQueryOptions: <TData = Awaited<ReturnType<typeof listCreditCards>>, TError = ErrorType<unknown>>(params?: ListCreditCardsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCreditCards>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCreditCards>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCreditCardsQueryResult = NonNullable<Awaited<ReturnType<typeof listCreditCards>>>;
export type ListCreditCardsQueryError = ErrorType<unknown>;
/**
 * @summary List credit cards
 */
export declare function useListCreditCards<TData = Awaited<ReturnType<typeof listCreditCards>>, TError = ErrorType<unknown>>(params?: ListCreditCardsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCreditCards>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a credit card
 */
export declare const getCreateCreditCardUrl: () => string;
export declare const createCreditCard: (createCreditCardBody: CreateCreditCardBody, options?: RequestInit) => Promise<CreditCard>;
export declare const getCreateCreditCardMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCreditCard>>, TError, {
        data: BodyType<CreateCreditCardBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createCreditCard>>, TError, {
    data: BodyType<CreateCreditCardBody>;
}, TContext>;
export type CreateCreditCardMutationResult = NonNullable<Awaited<ReturnType<typeof createCreditCard>>>;
export type CreateCreditCardMutationBody = BodyType<CreateCreditCardBody>;
export type CreateCreditCardMutationError = ErrorType<unknown>;
/**
 * @summary Create a credit card
 */
export declare const useCreateCreditCard: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCreditCard>>, TError, {
        data: BodyType<CreateCreditCardBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createCreditCard>>, TError, {
    data: BodyType<CreateCreditCardBody>;
}, TContext>;
/**
 * @summary Get a credit card by ID
 */
export declare const getGetCreditCardUrl: (id: number) => string;
export declare const getCreditCard: (id: number, options?: RequestInit) => Promise<CreditCard>;
export declare const getGetCreditCardQueryKey: (id: number) => readonly [`/api/credit-cards/${number}`];
export declare const getGetCreditCardQueryOptions: <TData = Awaited<ReturnType<typeof getCreditCard>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCreditCard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCreditCard>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCreditCardQueryResult = NonNullable<Awaited<ReturnType<typeof getCreditCard>>>;
export type GetCreditCardQueryError = ErrorType<void>;
/**
 * @summary Get a credit card by ID
 */
export declare function useGetCreditCard<TData = Awaited<ReturnType<typeof getCreditCard>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCreditCard>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update a credit card
 */
export declare const getUpdateCreditCardUrl: (id: number) => string;
export declare const updateCreditCard: (id: number, updateCreditCardBody: UpdateCreditCardBody, options?: RequestInit) => Promise<CreditCard>;
export declare const getUpdateCreditCardMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCreditCard>>, TError, {
        id: number;
        data: BodyType<UpdateCreditCardBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateCreditCard>>, TError, {
    id: number;
    data: BodyType<UpdateCreditCardBody>;
}, TContext>;
export type UpdateCreditCardMutationResult = NonNullable<Awaited<ReturnType<typeof updateCreditCard>>>;
export type UpdateCreditCardMutationBody = BodyType<UpdateCreditCardBody>;
export type UpdateCreditCardMutationError = ErrorType<void>;
/**
 * @summary Update a credit card
 */
export declare const useUpdateCreditCard: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCreditCard>>, TError, {
        id: number;
        data: BodyType<UpdateCreditCardBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateCreditCard>>, TError, {
    id: number;
    data: BodyType<UpdateCreditCardBody>;
}, TContext>;
/**
 * @summary Delete a credit card
 */
export declare const getDeleteCreditCardUrl: (id: number) => string;
export declare const deleteCreditCard: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteCreditCardMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCreditCard>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteCreditCard>>, TError, {
    id: number;
}, TContext>;
export type DeleteCreditCardMutationResult = NonNullable<Awaited<ReturnType<typeof deleteCreditCard>>>;
export type DeleteCreditCardMutationError = ErrorType<unknown>;
/**
 * @summary Delete a credit card
 */
export declare const useDeleteCreditCard: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCreditCard>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteCreditCard>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary List all proxies
 */
export declare const getListProxiesUrl: () => string;
export declare const listProxies: (options?: RequestInit) => Promise<Proxy[]>;
export declare const getListProxiesQueryKey: () => readonly ["/api/proxies"];
export declare const getListProxiesQueryOptions: <TData = Awaited<ReturnType<typeof listProxies>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProxies>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listProxies>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListProxiesQueryResult = NonNullable<Awaited<ReturnType<typeof listProxies>>>;
export type ListProxiesQueryError = ErrorType<unknown>;
/**
 * @summary List all proxies
 */
export declare function useListProxies<TData = Awaited<ReturnType<typeof listProxies>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listProxies>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a proxy
 */
export declare const getCreateProxyUrl: () => string;
export declare const createProxy: (createProxyBody: CreateProxyBody, options?: RequestInit) => Promise<Proxy>;
export declare const getCreateProxyMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProxy>>, TError, {
        data: BodyType<CreateProxyBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createProxy>>, TError, {
    data: BodyType<CreateProxyBody>;
}, TContext>;
export type CreateProxyMutationResult = NonNullable<Awaited<ReturnType<typeof createProxy>>>;
export type CreateProxyMutationBody = BodyType<CreateProxyBody>;
export type CreateProxyMutationError = ErrorType<unknown>;
/**
 * @summary Create a proxy
 */
export declare const useCreateProxy: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createProxy>>, TError, {
        data: BodyType<CreateProxyBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createProxy>>, TError, {
    data: BodyType<CreateProxyBody>;
}, TContext>;
/**
 * @summary Get a proxy by ID
 */
export declare const getGetProxyUrl: (id: number) => string;
export declare const getProxy: (id: number, options?: RequestInit) => Promise<Proxy>;
export declare const getGetProxyQueryKey: (id: number) => readonly [`/api/proxies/${number}`];
export declare const getGetProxyQueryOptions: <TData = Awaited<ReturnType<typeof getProxy>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProxy>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getProxy>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetProxyQueryResult = NonNullable<Awaited<ReturnType<typeof getProxy>>>;
export type GetProxyQueryError = ErrorType<void>;
/**
 * @summary Get a proxy by ID
 */
export declare function useGetProxy<TData = Awaited<ReturnType<typeof getProxy>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getProxy>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update a proxy
 */
export declare const getUpdateProxyUrl: (id: number) => string;
export declare const updateProxy: (id: number, updateProxyBody: UpdateProxyBody, options?: RequestInit) => Promise<Proxy>;
export declare const getUpdateProxyMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProxy>>, TError, {
        id: number;
        data: BodyType<UpdateProxyBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateProxy>>, TError, {
    id: number;
    data: BodyType<UpdateProxyBody>;
}, TContext>;
export type UpdateProxyMutationResult = NonNullable<Awaited<ReturnType<typeof updateProxy>>>;
export type UpdateProxyMutationBody = BodyType<UpdateProxyBody>;
export type UpdateProxyMutationError = ErrorType<void>;
/**
 * @summary Update a proxy
 */
export declare const useUpdateProxy: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateProxy>>, TError, {
        id: number;
        data: BodyType<UpdateProxyBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateProxy>>, TError, {
    id: number;
    data: BodyType<UpdateProxyBody>;
}, TContext>;
/**
 * @summary Delete a proxy
 */
export declare const getDeleteProxyUrl: (id: number) => string;
export declare const deleteProxy: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteProxyMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProxy>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteProxy>>, TError, {
    id: number;
}, TContext>;
export type DeleteProxyMutationResult = NonNullable<Awaited<ReturnType<typeof deleteProxy>>>;
export type DeleteProxyMutationError = ErrorType<unknown>;
/**
 * @summary Delete a proxy
 */
export declare const useDeleteProxy: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteProxy>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteProxy>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Test a proxy connection
 */
export declare const getTestProxyUrl: (id: number) => string;
export declare const testProxy: (id: number, options?: RequestInit) => Promise<ProxyTestResult>;
export declare const getTestProxyMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof testProxy>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof testProxy>>, TError, {
    id: number;
}, TContext>;
export type TestProxyMutationResult = NonNullable<Awaited<ReturnType<typeof testProxy>>>;
export type TestProxyMutationError = ErrorType<unknown>;
/**
 * @summary Test a proxy connection
 */
export declare const useTestProxy: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof testProxy>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof testProxy>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary List all task groups
 */
export declare const getListTaskGroupsUrl: () => string;
export declare const listTaskGroups: (options?: RequestInit) => Promise<TaskGroup[]>;
export declare const getListTaskGroupsQueryKey: () => readonly ["/api/task-groups"];
export declare const getListTaskGroupsQueryOptions: <TData = Awaited<ReturnType<typeof listTaskGroups>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTaskGroups>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listTaskGroups>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListTaskGroupsQueryResult = NonNullable<Awaited<ReturnType<typeof listTaskGroups>>>;
export type ListTaskGroupsQueryError = ErrorType<unknown>;
/**
 * @summary List all task groups
 */
export declare function useListTaskGroups<TData = Awaited<ReturnType<typeof listTaskGroups>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTaskGroups>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a task group
 */
export declare const getCreateTaskGroupUrl: () => string;
export declare const createTaskGroup: (createTaskGroupBody: CreateTaskGroupBody, options?: RequestInit) => Promise<TaskGroup>;
export declare const getCreateTaskGroupMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTaskGroup>>, TError, {
        data: BodyType<CreateTaskGroupBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createTaskGroup>>, TError, {
    data: BodyType<CreateTaskGroupBody>;
}, TContext>;
export type CreateTaskGroupMutationResult = NonNullable<Awaited<ReturnType<typeof createTaskGroup>>>;
export type CreateTaskGroupMutationBody = BodyType<CreateTaskGroupBody>;
export type CreateTaskGroupMutationError = ErrorType<unknown>;
/**
 * @summary Create a task group
 */
export declare const useCreateTaskGroup: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTaskGroup>>, TError, {
        data: BodyType<CreateTaskGroupBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createTaskGroup>>, TError, {
    data: BodyType<CreateTaskGroupBody>;
}, TContext>;
/**
 * @summary Get a task group by ID
 */
export declare const getGetTaskGroupUrl: (id: number) => string;
export declare const getTaskGroup: (id: number, options?: RequestInit) => Promise<TaskGroup>;
export declare const getGetTaskGroupQueryKey: (id: number) => readonly [`/api/task-groups/${number}`];
export declare const getGetTaskGroupQueryOptions: <TData = Awaited<ReturnType<typeof getTaskGroup>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTaskGroup>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTaskGroup>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTaskGroupQueryResult = NonNullable<Awaited<ReturnType<typeof getTaskGroup>>>;
export type GetTaskGroupQueryError = ErrorType<void>;
/**
 * @summary Get a task group by ID
 */
export declare function useGetTaskGroup<TData = Awaited<ReturnType<typeof getTaskGroup>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTaskGroup>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update a task group
 */
export declare const getUpdateTaskGroupUrl: (id: number) => string;
export declare const updateTaskGroup: (id: number, updateTaskGroupBody: UpdateTaskGroupBody, options?: RequestInit) => Promise<TaskGroup>;
export declare const getUpdateTaskGroupMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTaskGroup>>, TError, {
        id: number;
        data: BodyType<UpdateTaskGroupBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateTaskGroup>>, TError, {
    id: number;
    data: BodyType<UpdateTaskGroupBody>;
}, TContext>;
export type UpdateTaskGroupMutationResult = NonNullable<Awaited<ReturnType<typeof updateTaskGroup>>>;
export type UpdateTaskGroupMutationBody = BodyType<UpdateTaskGroupBody>;
export type UpdateTaskGroupMutationError = ErrorType<void>;
/**
 * @summary Update a task group
 */
export declare const useUpdateTaskGroup: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTaskGroup>>, TError, {
        id: number;
        data: BodyType<UpdateTaskGroupBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateTaskGroup>>, TError, {
    id: number;
    data: BodyType<UpdateTaskGroupBody>;
}, TContext>;
/**
 * @summary Delete a task group
 */
export declare const getDeleteTaskGroupUrl: (id: number) => string;
export declare const deleteTaskGroup: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteTaskGroupMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTaskGroup>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteTaskGroup>>, TError, {
    id: number;
}, TContext>;
export type DeleteTaskGroupMutationResult = NonNullable<Awaited<ReturnType<typeof deleteTaskGroup>>>;
export type DeleteTaskGroupMutationError = ErrorType<unknown>;
/**
 * @summary Delete a task group
 */
export declare const useDeleteTaskGroup: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTaskGroup>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteTaskGroup>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Start all idle tasks in a task group
 */
export declare const getStartTaskGroupUrl: (id: number) => string;
export declare const startTaskGroup: (id: number, options?: RequestInit) => Promise<BulkActionResult>;
export declare const getStartTaskGroupMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startTaskGroup>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof startTaskGroup>>, TError, {
    id: number;
}, TContext>;
export type StartTaskGroupMutationResult = NonNullable<Awaited<ReturnType<typeof startTaskGroup>>>;
export type StartTaskGroupMutationError = ErrorType<void>;
/**
 * @summary Start all idle tasks in a task group
 */
export declare const useStartTaskGroup: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startTaskGroup>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof startTaskGroup>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Stop all running tasks in a task group
 */
export declare const getStopTaskGroupUrl: (id: number) => string;
export declare const stopTaskGroup: (id: number, options?: RequestInit) => Promise<BulkActionResult>;
export declare const getStopTaskGroupMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopTaskGroup>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof stopTaskGroup>>, TError, {
    id: number;
}, TContext>;
export type StopTaskGroupMutationResult = NonNullable<Awaited<ReturnType<typeof stopTaskGroup>>>;
export type StopTaskGroupMutationError = ErrorType<void>;
/**
 * @summary Stop all running tasks in a task group
 */
export declare const useStopTaskGroup: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopTaskGroup>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof stopTaskGroup>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary List all tasks
 */
export declare const getListTasksUrl: (params?: ListTasksParams) => string;
export declare const listTasks: (params?: ListTasksParams, options?: RequestInit) => Promise<Task[]>;
export declare const getListTasksQueryKey: (params?: ListTasksParams) => readonly ["/api/tasks", ...ListTasksParams[]];
export declare const getListTasksQueryOptions: <TData = Awaited<ReturnType<typeof listTasks>>, TError = ErrorType<unknown>>(params?: ListTasksParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTasks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listTasks>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListTasksQueryResult = NonNullable<Awaited<ReturnType<typeof listTasks>>>;
export type ListTasksQueryError = ErrorType<unknown>;
/**
 * @summary List all tasks
 */
export declare function useListTasks<TData = Awaited<ReturnType<typeof listTasks>>, TError = ErrorType<unknown>>(params?: ListTasksParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTasks>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a task
 */
export declare const getCreateTaskUrl: () => string;
export declare const createTask: (createTaskBody: CreateTaskBody, options?: RequestInit) => Promise<Task>;
export declare const getCreateTaskMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTask>>, TError, {
        data: BodyType<CreateTaskBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createTask>>, TError, {
    data: BodyType<CreateTaskBody>;
}, TContext>;
export type CreateTaskMutationResult = NonNullable<Awaited<ReturnType<typeof createTask>>>;
export type CreateTaskMutationBody = BodyType<CreateTaskBody>;
export type CreateTaskMutationError = ErrorType<unknown>;
/**
 * @summary Create a task
 */
export declare const useCreateTask: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTask>>, TError, {
        data: BodyType<CreateTaskBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createTask>>, TError, {
    data: BodyType<CreateTaskBody>;
}, TContext>;
/**
 * @summary Get a task by ID
 */
export declare const getGetTaskUrl: (id: number) => string;
export declare const getTask: (id: number, options?: RequestInit) => Promise<Task>;
export declare const getGetTaskQueryKey: (id: number) => readonly [`/api/tasks/${number}`];
export declare const getGetTaskQueryOptions: <TData = Awaited<ReturnType<typeof getTask>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTask>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTask>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTaskQueryResult = NonNullable<Awaited<ReturnType<typeof getTask>>>;
export type GetTaskQueryError = ErrorType<void>;
/**
 * @summary Get a task by ID
 */
export declare function useGetTask<TData = Awaited<ReturnType<typeof getTask>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTask>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update a task
 */
export declare const getUpdateTaskUrl: (id: number) => string;
export declare const updateTask: (id: number, updateTaskBody: UpdateTaskBody, options?: RequestInit) => Promise<Task>;
export declare const getUpdateTaskMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTask>>, TError, {
        id: number;
        data: BodyType<UpdateTaskBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateTask>>, TError, {
    id: number;
    data: BodyType<UpdateTaskBody>;
}, TContext>;
export type UpdateTaskMutationResult = NonNullable<Awaited<ReturnType<typeof updateTask>>>;
export type UpdateTaskMutationBody = BodyType<UpdateTaskBody>;
export type UpdateTaskMutationError = ErrorType<void>;
/**
 * @summary Update a task
 */
export declare const useUpdateTask: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTask>>, TError, {
        id: number;
        data: BodyType<UpdateTaskBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateTask>>, TError, {
    id: number;
    data: BodyType<UpdateTaskBody>;
}, TContext>;
/**
 * @summary Delete a task
 */
export declare const getDeleteTaskUrl: (id: number) => string;
export declare const deleteTask: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteTaskMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTask>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteTask>>, TError, {
    id: number;
}, TContext>;
export type DeleteTaskMutationResult = NonNullable<Awaited<ReturnType<typeof deleteTask>>>;
export type DeleteTaskMutationError = ErrorType<unknown>;
/**
 * @summary Delete a task
 */
export declare const useDeleteTask: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTask>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteTask>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Start a task
 */
export declare const getStartTaskUrl: (id: number) => string;
export declare const startTask: (id: number, options?: RequestInit) => Promise<Task>;
export declare const getStartTaskMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startTask>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof startTask>>, TError, {
    id: number;
}, TContext>;
export type StartTaskMutationResult = NonNullable<Awaited<ReturnType<typeof startTask>>>;
export type StartTaskMutationError = ErrorType<unknown>;
/**
 * @summary Start a task
 */
export declare const useStartTask: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startTask>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof startTask>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Stop a task
 */
export declare const getStopTaskUrl: (id: number) => string;
export declare const stopTask: (id: number, options?: RequestInit) => Promise<Task>;
export declare const getStopTaskMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopTask>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof stopTask>>, TError, {
    id: number;
}, TContext>;
export type StopTaskMutationResult = NonNullable<Awaited<ReturnType<typeof stopTask>>>;
export type StopTaskMutationError = ErrorType<unknown>;
/**
 * @summary Stop a task
 */
export declare const useStopTask: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopTask>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof stopTask>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Start all idle, stopped, and failed tasks (skips tasks with incomplete profiles)
 */
export declare const getStartAllTasksUrl: () => string;
export declare const startAllTasks: (options?: RequestInit) => Promise<BulkActionResult>;
export declare const getStartAllTasksMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startAllTasks>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof startAllTasks>>, TError, void, TContext>;
export type StartAllTasksMutationResult = NonNullable<Awaited<ReturnType<typeof startAllTasks>>>;
export type StartAllTasksMutationError = ErrorType<unknown>;
/**
 * @summary Start all idle, stopped, and failed tasks (skips tasks with incomplete profiles)
 */
export declare const useStartAllTasks: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof startAllTasks>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof startAllTasks>>, TError, void, TContext>;
/**
 * @summary Stop all running tasks
 */
export declare const getStopAllTasksUrl: () => string;
export declare const stopAllTasks: (options?: RequestInit) => Promise<BulkActionResult>;
export declare const getStopAllTasksMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopAllTasks>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof stopAllTasks>>, TError, void, TContext>;
export type StopAllTasksMutationResult = NonNullable<Awaited<ReturnType<typeof stopAllTasks>>>;
export type StopAllTasksMutationError = ErrorType<unknown>;
/**
 * @summary Stop all running tasks
 */
export declare const useStopAllTasks: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof stopAllTasks>>, TError, void, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof stopAllTasks>>, TError, void, TContext>;
/**
 * @summary List checkout results
 */
export declare const getListCheckoutResultsUrl: (params?: ListCheckoutResultsParams) => string;
export declare const listCheckoutResults: (params?: ListCheckoutResultsParams, options?: RequestInit) => Promise<CheckoutResult[]>;
export declare const getListCheckoutResultsQueryKey: (params?: ListCheckoutResultsParams) => readonly ["/api/checkout-results", ...ListCheckoutResultsParams[]];
export declare const getListCheckoutResultsQueryOptions: <TData = Awaited<ReturnType<typeof listCheckoutResults>>, TError = ErrorType<unknown>>(params?: ListCheckoutResultsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCheckoutResults>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCheckoutResults>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCheckoutResultsQueryResult = NonNullable<Awaited<ReturnType<typeof listCheckoutResults>>>;
export type ListCheckoutResultsQueryError = ErrorType<unknown>;
/**
 * @summary List checkout results
 */
export declare function useListCheckoutResults<TData = Awaited<ReturnType<typeof listCheckoutResults>>, TError = ErrorType<unknown>>(params?: ListCheckoutResultsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCheckoutResults>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Record a checkout result
 */
export declare const getCreateCheckoutResultUrl: () => string;
export declare const createCheckoutResult: (createCheckoutResultBody: CreateCheckoutResultBody, options?: RequestInit) => Promise<CheckoutResult>;
export declare const getCreateCheckoutResultMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCheckoutResult>>, TError, {
        data: BodyType<CreateCheckoutResultBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createCheckoutResult>>, TError, {
    data: BodyType<CreateCheckoutResultBody>;
}, TContext>;
export type CreateCheckoutResultMutationResult = NonNullable<Awaited<ReturnType<typeof createCheckoutResult>>>;
export type CreateCheckoutResultMutationBody = BodyType<CreateCheckoutResultBody>;
export type CreateCheckoutResultMutationError = ErrorType<unknown>;
/**
 * @summary Record a checkout result
 */
export declare const useCreateCheckoutResult: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createCheckoutResult>>, TError, {
        data: BodyType<CreateCheckoutResultBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createCheckoutResult>>, TError, {
    data: BodyType<CreateCheckoutResultBody>;
}, TContext>;
/**
 * @summary Get a checkout result by ID
 */
export declare const getGetCheckoutResultUrl: (id: number) => string;
export declare const getCheckoutResult: (id: number, options?: RequestInit) => Promise<CheckoutResult>;
export declare const getGetCheckoutResultQueryKey: (id: number) => readonly [`/api/checkout-results/${number}`];
export declare const getGetCheckoutResultQueryOptions: <TData = Awaited<ReturnType<typeof getCheckoutResult>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCheckoutResult>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCheckoutResult>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCheckoutResultQueryResult = NonNullable<Awaited<ReturnType<typeof getCheckoutResult>>>;
export type GetCheckoutResultQueryError = ErrorType<void>;
/**
 * @summary Get a checkout result by ID
 */
export declare function useGetCheckoutResult<TData = Awaited<ReturnType<typeof getCheckoutResult>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCheckoutResult>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update a checkout result
 */
export declare const getUpdateCheckoutResultUrl: (id: number) => string;
export declare const updateCheckoutResult: (id: number, updateCheckoutResultBody: UpdateCheckoutResultBody, options?: RequestInit) => Promise<CheckoutResult>;
export declare const getUpdateCheckoutResultMutationOptions: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCheckoutResult>>, TError, {
        id: number;
        data: BodyType<UpdateCheckoutResultBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateCheckoutResult>>, TError, {
    id: number;
    data: BodyType<UpdateCheckoutResultBody>;
}, TContext>;
export type UpdateCheckoutResultMutationResult = NonNullable<Awaited<ReturnType<typeof updateCheckoutResult>>>;
export type UpdateCheckoutResultMutationBody = BodyType<UpdateCheckoutResultBody>;
export type UpdateCheckoutResultMutationError = ErrorType<void>;
/**
 * @summary Update a checkout result
 */
export declare const useUpdateCheckoutResult: <TError = ErrorType<void>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateCheckoutResult>>, TError, {
        id: number;
        data: BodyType<UpdateCheckoutResultBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateCheckoutResult>>, TError, {
    id: number;
    data: BodyType<UpdateCheckoutResultBody>;
}, TContext>;
/**
 * @summary Delete a checkout result
 */
export declare const getDeleteCheckoutResultUrl: (id: number) => string;
export declare const deleteCheckoutResult: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteCheckoutResultMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCheckoutResult>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteCheckoutResult>>, TError, {
    id: number;
}, TContext>;
export type DeleteCheckoutResultMutationResult = NonNullable<Awaited<ReturnType<typeof deleteCheckoutResult>>>;
export type DeleteCheckoutResultMutationError = ErrorType<unknown>;
/**
 * @summary Delete a checkout result
 */
export declare const useDeleteCheckoutResult: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteCheckoutResult>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteCheckoutResult>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Get analytics summary
 */
export declare const getGetAnalyticsSummaryUrl: () => string;
export declare const getAnalyticsSummary: (options?: RequestInit) => Promise<AnalyticsSummary>;
export declare const getGetAnalyticsSummaryQueryKey: () => readonly ["/api/analytics/summary"];
export declare const getGetAnalyticsSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getAnalyticsSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetAnalyticsSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getAnalyticsSummary>>>;
export type GetAnalyticsSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Get analytics summary
 */
export declare function useGetAnalyticsSummary<TData = Awaited<ReturnType<typeof getAnalyticsSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getAnalyticsSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get checkout counts over time
 */
export declare const getGetCheckoutsOverTimeUrl: (params?: GetCheckoutsOverTimeParams) => string;
export declare const getCheckoutsOverTime: (params?: GetCheckoutsOverTimeParams, options?: RequestInit) => Promise<CheckoutTimeSeriesPoint[]>;
export declare const getGetCheckoutsOverTimeQueryKey: (params?: GetCheckoutsOverTimeParams) => readonly ["/api/analytics/checkouts-over-time", ...GetCheckoutsOverTimeParams[]];
export declare const getGetCheckoutsOverTimeQueryOptions: <TData = Awaited<ReturnType<typeof getCheckoutsOverTime>>, TError = ErrorType<unknown>>(params?: GetCheckoutsOverTimeParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCheckoutsOverTime>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getCheckoutsOverTime>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetCheckoutsOverTimeQueryResult = NonNullable<Awaited<ReturnType<typeof getCheckoutsOverTime>>>;
export type GetCheckoutsOverTimeQueryError = ErrorType<unknown>;
/**
 * @summary Get checkout counts over time
 */
export declare function useGetCheckoutsOverTime<TData = Awaited<ReturnType<typeof getCheckoutsOverTime>>, TError = ErrorType<unknown>>(params?: GetCheckoutsOverTimeParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getCheckoutsOverTime>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map