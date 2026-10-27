window.__ModuleLoader__.load({
  id: '@local/dsh-price-badge',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'price-badge';
    const BEIJING_OFFSET_MS = 8 * 3600 * 1000;
    const DAY_MS = 24 * 3600 * 1000;
    const BALANCE_ENDPOINT = '/plugins/price-badge/balance';
    const BALANCE_REFRESH_MS = 60000;

    function formatMoney(amount, currency) {
      const value = Number(amount);
      if (!Number.isFinite(value)) return `${amount} ${currency}`;
      const symbol = currency === 'USD' ? '$' : '¥';
      const fixed = Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(2);
      return `${symbol}${fixed}`;
    }

    /** Beijing wall-clock parts for an absolute timestamp (China has no DST). */
    function beijingParts(ms) {
      const d = new Date(ms + BEIJING_OFFSET_MS);
      return {
        day: d.getUTCDay(),
        hours: d.getUTCHours(),
        minutes: d.getUTCMinutes(),
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        date: d.getUTCDate(),
      };
    }

    // DeepSeek 官方峰谷计价（北京时间）：周一至周五 09:00-12:00、14:00-18:00 为高峰，
    // 其余时段（含周末）为空闲，价格为高峰的一半。
    function isPeak(ms) {
      const p = beijingParts(ms);
      if (p.day === 0 || p.day === 6) return false;
      const minutes = p.hours * 60 + p.minutes;
      return (minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080);
    }

    /** Absolute epoch ms of the next boundary where the peak state actually flips. */
    function nextTransition(ms) {
      const p = beijingParts(ms);
      const midnight = Date.UTC(p.year, p.month, p.date) - BEIJING_OFFSET_MS;
      const boundaries = [9, 12, 14, 18];
      const current = isPeak(ms);
      for (let day = 0; day < 8; day += 1) {
        for (const hour of boundaries) {
          const at = midnight + day * DAY_MS + hour * 3600 * 1000;
          if (at <= ms) continue;
          if (isPeak(at) !== current) return at;
        }
      }
      return ms + 3600 * 1000;
    }

    function formatCountdown(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const pad = (n) => String(n).padStart(2, '0');
      const s = total % 60;
      const m = Math.floor(total / 60) % 60;
      const hh = Math.floor(total / 3600);
      return hh > 0 ? `${hh}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    function formatBeijingClock(ms) {
      const p = beijingParts(ms);
      const pad = (n) => String(n).padStart(2, '0');
      const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][p.day];
      return `${weekday} ${pad(p.hours)}:${pad(p.minutes)}`;
    }

    const zh = {
      'badge.peak': '高峰',
      'badge.offpeak': '空闲 · 5 折',
      'badge.toPeak': '距高峰 {time}',
      'badge.toOffpeak': '距空闲 {time}',
      'badge.balance': '余额 {amount}',
      'badge.balanceBonus': '余额 {amount}（赠金 {bonus}）',
      'badge.balanceLoading': '余额读取中',
      'badge.balanceSignedOut': '未登录账户',
      'badge.balanceFailed': '余额不可用',
      'panel.title': 'DeepSeek API 价格时段',
      'panel.nowPeak': '当前为高峰时段，按全价计费。',
      'panel.nowOffpeak': '当前为空闲时段，价格为高峰的 50%。',
      'panel.next': '下次切换：{at}（进入{label}）',
      'panel.ruleTitle': '计费规则（北京时间）',
      'panel.peakRule': '周一至周五 09:00–12:00、14:00–18:00 为高峰',
      'panel.offpeakRule': '其余全部时间（含周末）为空闲，价格为高峰的一半',
      'panel.note': '注：法定节假日未单独识别，节假日当天可能显示为高峰。',
      'panel.collapse': '收起',
      'panel.expand': '展开时段表',
      'flash.toPeak': '已进入高峰时段',
      'flash.toOffpeak': '已进入空闲时段（5 折）',
      'a11y.region': 'DeepSeek API 价格时段',
    };

    const en = {
      'badge.peak': 'Peak',
      'badge.offpeak': 'Off-peak · 50%',
      'badge.toPeak': 'Peak in {time}',
      'badge.toOffpeak': 'Off-peak in {time}',
      'badge.balance': 'Balance {amount}',
      'badge.balanceBonus': 'Balance {amount} (bonus {bonus})',
      'badge.balanceLoading': 'Loading balance',
      'badge.balanceSignedOut': 'Not signed in',
      'badge.balanceFailed': 'Balance unavailable',
      'panel.title': 'DeepSeek API Pricing Period',
      'panel.nowPeak': 'Peak hours — standard price applies.',
      'panel.nowOffpeak': 'Off-peak hours — 50% of the peak price.',
      'panel.next': 'Next switch: {at} (to {label})',
      'panel.ruleTitle': 'Rules (Beijing time)',
      'panel.peakRule': 'Peak: Mon–Fri 09:00–12:00 and 14:00–18:00',
      'panel.offpeakRule': 'All other hours (weekends included) are off-peak at half price',
      'panel.note': 'Note: Chinese public holidays are not detected; a holiday may show as peak.',
      'panel.collapse': 'Collapse',
      'panel.expand': 'Show schedule',
      'flash.toPeak': 'Peak hours started',
      'flash.toOffpeak': 'Off-peak hours started (50%)',
      'a11y.region': 'DeepSeek API pricing period',
    };

    function format(template, vars) {
      if (typeof template !== 'string') return '';
      return template.replace(/\{(\w+)\}/g, (m, key) => (vars && vars[key] !== undefined ? String(vars[key]) : m));
    }

    /** Build the badge component bound to one translate function and a locale subscription. */
    function makeBadge(t, subscribeLocale) {
      return function PriceBadge() {
        const [now, setNow] = React.useState(() => Date.now());
        const [open, setOpen] = React.useState(false);
        const [flash, setFlash] = React.useState(null);
        const [seenPeak, setSeenPeak] = React.useState(() => isPeak(Date.now()));
        const [balance, setBalance] = React.useState({ status: 'loading' });
        const [, setLocaleRevision] = React.useState(0);

        // 1s tick keeps countdown and period current.
        React.useEffect(() => {
          const id = setInterval(() => setNow(Date.now()), 1000);
          return () => clearInterval(id);
        }, []);

        // Wallet balance: refresh on mount and periodically; a failure keeps the last value.
        React.useEffect(() => {
          let alive = true;
          const load = async () => {
            try {
              const response = await fetch(BALANCE_ENDPOINT, { cache: 'no-store' });
              if (!response.ok) throw new Error(String(response.status));
              const data = await response.json();
              if (alive) setBalance(data && data.status ? data : { status: 'error' });
            } catch {
              if (alive) setBalance((previous) => (previous.status === 'ready' ? previous : { status: 'error' }));
            }
          };
          load();
          const id = setInterval(load, BALANCE_REFRESH_MS);
          return () => {
            alive = false;
            clearInterval(id);
          };
        }, []);

        // Re-render (not re-register) when the user switches locale.
        React.useEffect(() => subscribeLocale(() => setLocaleRevision((v) => v + 1)), [subscribeLocale]);

        // Highlight for a few seconds whenever the period actually flips.
        React.useEffect(() => {
          const peak = isPeak(now);
          if (peak === seenPeak) return undefined;
          setSeenPeak(peak);
          setFlash(peak ? 'peak' : 'offpeak');
          const timer = setTimeout(() => setFlash(null), 6000);
          return () => clearTimeout(timer);
        }, [now, seenPeak]);

        const peak = isPeak(now);
        const next = nextTransition(now);
        const countdown = formatCountdown(next - now);
        const accent = peak ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-success-primary)';
        const label = peak ? t('badge.peak') : t('badge.offpeak');
        const countdownText = peak
          ? format(t('badge.toOffpeak'), { time: countdown })
          : format(t('badge.toPeak'), { time: countdown });
        const flashText = flash === 'peak'
          ? t('flash.toPeak')
          : flash === 'offpeak'
            ? t('flash.toOffpeak')
            : null;

        // Balance text: last good value survives a transient failure.
        let balanceText = null;
        if (balance.status === 'ready') {
          const amount = formatMoney(balance.balance, balance.currency);
          balanceText = balance.bonus !== undefined && balance.bonus !== ''
            ? format(t('badge.balanceBonus'), { amount, bonus: formatMoney(balance.bonus, balance.currency) })
            : format(t('badge.balance'), { amount });
        } else if (balance.status === 'signed-out') {
          balanceText = t('badge.balanceSignedOut');
        } else if (balance.status === 'loading') {
          balanceText = t('badge.balanceLoading');
        } else {
          balanceText = t('badge.balanceFailed');
        }
        const balanceOk = balance.status === 'ready';

        const pillStyle = {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 30,
          padding: '0 12px',
          borderRadius: 999,
          border: `1px solid ${peak ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-border-l2)'}`,
          background: 'var(--dsw-alias-bg-overlay)',
          color: 'var(--dsw-alias-label-primary)',
          boxShadow: flash
            ? `0 0 0 3px ${accent}, 0 6px 18px rgba(0, 0, 0, 0.18)`
            : '0 4px 12px rgba(0, 0, 0, 0.12)',
          font: 'inherit',
          fontSize: 12,
          lineHeight: '18px',
          cursor: 'pointer',
          pointerEvents: 'auto',
          transition: 'box-shadow 180ms ease, border-color 180ms ease, transform 180ms ease',
          transform: flash ? 'scale(1.04)' : 'scale(1)',
        };

        const dotStyle = {
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: accent,
          flexShrink: 0,
          transition: 'background 180ms ease',
        };

        const rowStyle = {
          display: 'flex',
          gap: 6,
          fontSize: 12,
          lineHeight: '18px',
          color: 'var(--dsw-alias-label-secondary)',
        };

        const panelStyle = {
          position: 'absolute',
          right: 0,
          bottom: 38,
          width: 272,
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-overlay)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.20)',
          color: 'var(--dsw-alias-label-primary)',
          pointerEvents: 'auto',
        };

        return h('div', {
          style: { position: 'fixed', right: 16, bottom: 16, zIndex: 40, pointerEvents: 'none' },
          role: 'region',
          'aria-label': t('a11y.region'),
        },
          open
            ? h('div', { style: panelStyle },
                h('div', { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 } }, t('panel.title')),
                h('div', { style: { ...rowStyle, alignItems: 'center', color: 'var(--dsw-alias-label-primary)', marginBottom: 8 } },
                  h('span', {
                    style: {
                      display: 'inline-block',
                      padding: '1px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                      lineHeight: '16px',
                      background: accent,
                      color: 'var(--dsw-alias-bg-base)',
                      flexShrink: 0,
                    },
                  }, label),
                  h('span', null, peak ? t('panel.nowPeak') : t('panel.nowOffpeak')),
                ),
                h('div', { style: { ...rowStyle, marginBottom: 10 } },
                  format(t('panel.next'), { at: formatBeijingClock(next), label: peak ? t('badge.offpeak') : t('badge.peak') }),
                ),
                h('div', { style: { ...rowStyle, marginBottom: 10, color: 'var(--dsw-alias-label-primary)' } }, balanceText),
                h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, t('panel.ruleTitle')),
                h('div', { style: { ...rowStyle, marginBottom: 2 } }, '• ' + t('panel.peakRule')),
                h('div', { style: { ...rowStyle, marginBottom: 8 } }, '• ' + t('panel.offpeakRule')),
                h('div', { style: { ...rowStyle, fontSize: 11 } }, t('panel.note')),
                h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 8 } },
                  h('button', {
                    type: 'button',
                    onClick: () => setOpen(false),
                    style: {
                      border: '1px solid var(--dsw-alias-border-l1)',
                      background: 'transparent',
                      color: 'var(--dsw-alias-label-secondary)',
                      borderRadius: 6,
                      padding: '3px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                      font: 'inherit',
                    },
                  }, t('panel.collapse')),
                ),
              )
            : null,
          h('button', {
            type: 'button',
            onClick: () => setOpen((value) => !value),
            'aria-expanded': open,
            'aria-label': `${label} · ${countdownText} · ${open ? t('panel.collapse') : t('panel.expand')}`,
            style: pillStyle,
          },
            h('span', { style: dotStyle, 'aria-hidden': true }),
            h('span', { style: { fontWeight: 600, whiteSpace: 'nowrap' } }, label),
            h('span', {
              style: {
                color: 'var(--dsw-alias-label-secondary)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              },
            }, countdownText),
            balanceText
              ? h('span', {
                  style: {
                    marginLeft: 2,
                    paddingLeft: 8,
                    borderLeft: '1px solid var(--dsw-alias-border-l1)',
                    color: balanceOk ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  },
                  title: balanceText,
                }, balanceText)
              : null,
            flashText
              ? h('span', {
                  style: { marginLeft: 2, color: accent, fontWeight: 600, whiteSpace: 'nowrap' },
                  role: 'status',
                }, flashText)
              : null,
          ),
        );
      };
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'price-badge: dictionaries');
        const t = ctx.locale.bind(NS);
        const subscribeLocale = (listener) => ctx.locale.subscribe(listener);
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'price-badge',
          order: 50,
        }, makeBadge(t, subscribeLocale)));
      },
    };
  },
});
