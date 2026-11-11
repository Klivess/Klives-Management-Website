import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload, PERMISSIONS } from './permissions';

/**
 * A stateful stand-in for the routes behind the OmniSettings page. Rows have the shape
 * OmniGlobalSettingsManager.BoardView produces (and ApiView, for a server from before the board);
 * the names follow the live store and every value is invented. A save changes the state, so a test
 * can edit a setting and read it back.
 *
 * Sensitive rows deliberately carry a real-looking value in Value and DropdownOptions, as a buggy
 * server might: the page must mask them itself.
 */

export const settingsTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

/** Must never appear on the page or in the console. */
export const STORED_SECRET = 'stored-secret-must-stay-hidden';
/** A failed save echoes this in its body. The page must never show or log a server error body. */
export const ECHOED_SECRET = 'server-error-body-must-stay-hidden';

export interface FakeSetting {
  Name: string;
  Type: number;
  Sensitive: boolean;
  HasValue: boolean;
  ParentServiceId: string;
  ParentServiceName: string;
  Value: string;
  DropdownOptions?: string[];
  ReadThisSession: boolean;
  LastReadUtc?: string;
  UpdatedUtc?: string;
  UpdatedBy?: string;
  DefaultValue?: string;
  Awaiting?: boolean;
  AwaitingSinceUtc?: string;
}

export interface SettingsMockOptions {
  /** A server from before the board route: List only, with nine fields. */
  legacyServer?: boolean;
  /** A profile that may read settings but not change them. */
  readOnly?: boolean;
  /** What every save answers (200 by default). */
  setStatus?: number;
  /** How long read times have been kept (days). Under 14, "not read" means "since the restart". */
  trackingDays?: number;
}

export interface SettingsApiMock {
  boardReads: string[];
  listReads: string[];
  sets: Array<Record<string, any>>;
  deletes: Array<Record<string, any>>;
  /** Every request URL, for checks that nothing asked for secrets. */
  urls: string[];
  settings: FakeSetting[];
  setStatus: number;
}

const String_ = 0, Bool = 1, Int = 2, Dropdown = 3, List = 4;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

const PERSONALITY = 'Calm, direct and brief. Explains a decision once, in plain words, and names what it could not check. '
  + 'Prefers measuring to guessing. Never pretends a step happened when it did not. '.repeat(5);

function seed(): FakeSetting[] {
  const row = (owner: string, name: string, type: number, value: string, extra: Partial<FakeSetting> = {}): FakeSetting => ({
    Name: name, Type: type, Sensitive: false, HasValue: value.length > 0, ParentServiceId: '0', ParentServiceName: owner, Value: value,
    ReadThisSession: true, LastReadUtc: ago(4 * MIN), ...extra,
  });
  const secret = (owner: string, name: string, hasValue: boolean, extra: Partial<FakeSetting> = {}): FakeSetting => ({
    ...row(owner, name, String_, hasValue ? STORED_SECRET : '', extra), Sensitive: true, HasValue: hasValue, DropdownOptions: [STORED_SECRET],
  });
  return [
    // KliveAgent
    row('KliveAgent', 'KliveAgent_MaxRunBillableTokens', Int, '4000000', { DefaultValue: '4000000', UpdatedUtc: ago(12 * DAY), UpdatedBy: 'KliveAgent' }),
    row('KliveAgent', 'KliveAgent_MaxRunTokens', Int, '600000', { ReadThisSession: false, LastReadUtc: undefined }),
    row('KliveAgent', 'KliveAgent_StallTimeoutMinutes', Int, '45', { DefaultValue: '30', UpdatedUtc: ago(2 * HOUR), UpdatedBy: 'Klives' }),
    row('KliveAgent', 'KliveAgent_ScriptTimeoutSeconds', Int, '86400', { DefaultValue: '86400' }),
    row('KliveAgent', 'KliveAgent_Enabled', Bool, 'true', { DefaultValue: 'True' }),
    row('KliveAgent', 'KliveAgent_Enabled', Bool, 'False', { ParentServiceId: 'KliveAgent', ReadThisSession: false, LastReadUtc: undefined }),
    row('KliveAgent', 'KliveAgent_VisionEnabled', Bool, 'false', { DefaultValue: 'True' }),
    row('KliveAgent', 'KliveAgent_Personality', String_, PERSONALITY, { DefaultValue: PERSONALITY }),
    row('KliveAgent', 'KliveAgent_TalkAudioFormat', Dropdown, 'mp3', { DropdownOptions: ['mp3', 'wav'], DefaultValue: 'mp3' }),
    row('KliveAgent', 'KliveAgent_ComputerTarget', Dropdown, 'Host', { DropdownOptions: ['Host', 'Container', 'Ask'], DefaultValue: 'Host' }),
    row('KliveAgent', 'KliveAgent_FastModel', String_, 'example-vendor/fast-model-1', { DefaultValue: 'example-vendor/fast-model-1' }),
    // KliveLLM
    row('KliveLLM', 'ThinkingType', Dropdown, 'Medium', { DropdownOptions: ['None', 'Low', 'Medium', 'High'], DefaultValue: 'Medium' }),
    row('KliveLLM', 'RemoteLLMProvider', Dropdown, 'OpenRouter', { DropdownOptions: ['HuggingFace', 'OpenRouter', 'AIRouter', 'CustomOpenAI', 'Local'], DefaultValue: 'HuggingFace' }),
    row('KliveLLM', 'OpenRouterModelID', String_, 'example-vendor/model-a', { DefaultValue: 'example-vendor/model-a' }),
    secret('KliveLLM', 'OpenRouterLLMToken', true),
    row('KliveLLM', 'InferenceParameterTemperature', Int, '7', { DefaultValue: '7' }),
    // OmniTrader
    secret('OmniTrader', 'OmniTrader.Trading212.Live.ApiSecret', false),
    secret('OmniTrader', 'OmniTrader.FRED.ApiKey', false, { ReadThisSession: false, LastReadUtc: undefined }),
    // Projects
    row('Projects', 'Projects_CacheHaltWindowMinutes', Int, '30', { DefaultValue: '30' }),
    row('Projects', 'Projects_FileMaxSizeGb', Int, '4', { DefaultValue: '4' }),
    row('Projects', 'Projects_CacheHaltEnabled', Bool, 'true', { DefaultValue: 'True' }),
    // CS2ArbitrageBot
    row('CS2ArbitrageBot', 'CS2ArbitrageMinimumProfitPence', Int, '25', { DefaultValue: '25' }),
    row('CS2ArbitrageBot', 'CS2ArbitrageSteamRequestSpacingMs', Int, '2500', { DefaultValue: '2500' }),
    secret('CS2ArbitrageBot', 'CSFloatAPIKey', true),
    // OmniBlox
    row('OmniBlox', 'OmniBlox_ExperienceSlots', List, '["slot-one"]', { DefaultValue: '[]' }),
    row('OmniBlox', 'OmniBlox_Enabled', Bool, 'true', { DefaultValue: 'False', UpdatedUtc: ago(3 * DAY), UpdatedBy: 'Klives' }),
    // KliveChat: a service blocked on a secret
    secret('KliveChatService', 'KliveChat_TurnSecret', false, { Awaiting: true, AwaitingSinceUtc: ago(3 * HOUR) }),
    row('KliveChatService', 'KliveChat_TurnUrls', String_, '', { DefaultValue: '' }),
    // Made outside any service, never read
    row('Omni Global Settings Manager', 'BaseUrl', String_, '', { ReadThisSession: false, LastReadUtc: undefined }),
    row('Omni Global Settings Manager', 'Find.Smtp', String_, '', { ReadThisSession: false, LastReadUtc: undefined }),
    secret('Omni Global Settings Manager', 'MailRelay.Password', false, { ReadThisSession: false, LastReadUtc: undefined }),
    // KliveAPI
    row('KliveAPI', 'KliveAPITelemetryRetention1hDays', Int, '400', { DefaultValue: '400' }),
  ];
}

/** OmniGlobalSettingsManager.SameSettingValue. */
function same(type: number, a: string, b: string): boolean {
  if (type === Bool) return a.trim().toLowerCase() === b.trim().toLowerCase();
  if (type === Int) return /^\s*[+-]?\d+\s*$/.test(a) && /^\s*[+-]?\d+\s*$/.test(b) ? Number(a) === Number(b) : a.trim() === b.trim();
  if (type === Dropdown) return a.trim().toLowerCase() === b.trim().toLowerCase();
  if (type === List) {
    const read = (text: string) => { try { return JSON.stringify((JSON.parse(text || '[]') as string[]).map(x => x.trim()).filter(Boolean)); } catch { return text; } };
    return read(a) === read(b);
  }
  return a === b;
}

/** OmniGlobalSettingsManager.ValidateApiValue. */
function valid(setting: FakeSetting, value: string): boolean {
  if (setting.Type === Bool) return /^(true|false)$/i.test(value.trim());
  if (setting.Type === Int) return /^\s*[+-]?\d+\s*$/.test(value) && Math.abs(Number(value)) <= 2_147_483_647;
  if (setting.Type === Dropdown) return (setting.DropdownOptions ?? []).some(option => option.toLowerCase() === value.trim().toLowerCase());
  if (setting.Type === List) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) && parsed.every(x => typeof x === 'string'); } catch { return false; } }
  return value.length <= 65_536;
}

function boardRow(setting: FakeSetting): Record<string, unknown> {
  const row: Record<string, unknown> = {
    Name: setting.Name, Type: setting.Type, Sensitive: setting.Sensitive, HasValue: setting.HasValue,
    ParentServiceId: setting.ParentServiceId, ParentServiceName: setting.ParentServiceName,
    Value: setting.Sensitive ? (setting.HasValue ? STORED_SECRET : '') : setting.Value,
    ReadThisSession: setting.ReadThisSession,
  };
  if (setting.DropdownOptions?.length) row.DropdownOptions = setting.DropdownOptions;
  if (setting.LastReadUtc) row.LastReadUtc = setting.LastReadUtc;
  if (setting.UpdatedUtc) row.UpdatedUtc = setting.UpdatedUtc;
  if (setting.UpdatedBy) row.UpdatedBy = setting.UpdatedBy;
  if (setting.DefaultValue != null && !setting.Sensitive) {
    row.DefaultValue = setting.DefaultValue;
    row.MatchesDefault = same(setting.Type, setting.Value, setting.DefaultValue);
  }
  if (setting.Awaiting) { row.Awaiting = true; row.AwaitingSinceUtc = setting.AwaitingSinceUtc; }
  return row;
}

function listRow(setting: FakeSetting): Record<string, unknown> {
  return {
    Name: setting.Name, Type: setting.Type, Sensitive: setting.Sensitive, ParentServiceId: setting.ParentServiceId,
    ParentServiceName: setting.ParentServiceName, WasUsedThisSession: setting.ReadThisSession, HasValue: setting.HasValue,
    DropdownOptions: setting.DropdownOptions ?? [], Value: setting.Sensitive ? (setting.HasValue ? STORED_SECRET : '') : setting.Value,
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control',
  'access-control-expose-headers': 'RequestDeniedCode',
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
}

async function text(route: Route, body: string, status = 200) {
  await route.fulfill({ status, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' }, body });
}

export async function installSettingsApiMock(page: Page, options: SettingsMockOptions = {}): Promise<SettingsApiMock> {
  const state: SettingsApiMock = {
    boardReads: [], listReads: [], sets: [], deletes: [], urls: [], settings: seed(), setStatus: options.setStatus ?? 200,
  };
  const trackingSince = ago((options.trackingDays ?? 2) * DAY);
  const readOnlyPermissions = PERMISSIONS.map(p => p.key).filter(key => key !== 'system.settings.write');

  await page.routeWebSocket('wss://klive.dev/**', () => {});
  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    state.urls.push(`${request.method()} ${url.pathname}${url.search}`);
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS, body: '' }); return; }

    switch (url.pathname) {
      case '/KMProfiles/LoginStatus': await text(route, 'SessionActive'); return;
      case '/KMProfiles/me':
        await json(route, options.readOnly
          ? mePayload({ rank: 4, name: 'Reader Fixture', permissions: readOnlyPermissions })
          : mePayload({ rank: 5, name: 'Klives Fixture' }));
        return;
      case '/KMProfiles/permissions/catalog': await json(route, catalogPayload()); return;
      case '/OmniGlobalSettings/Board':
        state.boardReads.push(url.search);
        if (options.legacyServer) { await text(route, 'Route not found.', 404); return; }
        await json(route, {
          Version: 1, GeneratedUtc: new Date().toISOString(), SessionStartedUtc: ago(6 * MIN), ReadTrackingSinceUtc: trackingSince,
          Settings: state.settings.map(boardRow),
        });
        return;
      case '/OmniGlobalSettings/List':
        state.listReads.push(url.search);
        await json(route, state.settings.map(listRow));
        return;
      case '/OmniGlobalSettings/Set': {
        const body = request.postDataJSON() as Record<string, any>;
        state.sets.push(body);
        const target = state.settings.find(s => s.Name.toLowerCase() === String(body.name).toLowerCase() && s.ParentServiceId === (body.parentServiceId ?? '0'));
        if (options.readOnly) { await json(route, { error: 'AccessDenied', reason: 'MissingPermission' }, 403); return; }
        if (state.setStatus !== 200) { await json(route, { error: `${ECHOED_SECRET} ${String(body.value)}` }, state.setStatus); return; }
        if (!target) { await text(route, 'InvalidSettingsRequest', 400); return; }
        if (!valid(target, String(body.value))) { await json(route, { error: `${ECHOED_SECRET} InvalidSettingsRequest` }, 400); return; }
        const value = target.Type === Dropdown
          ? target.DropdownOptions!.find(option => option.toLowerCase() === String(body.value).trim().toLowerCase())!
          : String(body.value);
        if (!same(target.Type, target.Value, value) || target.Sensitive) {
          target.UpdatedUtc = new Date().toISOString();
          target.UpdatedBy = 'Klives Fixture';
        }
        target.Value = value;
        target.HasValue = value.length > 0;
        if (target.HasValue) target.Awaiting = false;
        if (body.returnView === true && !options.legacyServer) await json(route, boardRow(target));
        else await text(route, 'OK');
        return;
      }
      case '/OmniGlobalSettings/Delete': {
        const body = request.postDataJSON() as Record<string, any>;
        state.deletes.push(body);
        const before = state.settings.length;
        state.settings = state.settings.filter(s => !(s.Name.toLowerCase() === String(body.name).toLowerCase() && s.ParentServiceId === (body.parentServiceId ?? '0')));
        await text(route, state.settings.length < before ? 'Deleted' : 'NotFound', state.settings.length < before ? 200 : 404);
        return;
      }
      default:
        await json(route, { success: true });
    }
  });
  return state;
}

/** Opens the OmniSettings page with the fake server behind it. */
export async function openSettings(page: Page, options: SettingsMockOptions & { path?: string } = {}): Promise<SettingsApiMock> {
  const api = await installSettingsApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-settings', url: settingsTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  // See admin-api.ts: a long run on Windows can exhaust socket buffers; give it a moment and load again.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/administration/omnisettings', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.getByTestId('ost-root').waitFor({ state: 'visible', timeout: 15_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
