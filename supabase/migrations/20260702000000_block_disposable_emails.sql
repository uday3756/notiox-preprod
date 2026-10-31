-- ============================================================================
-- Block disposable / temporary email domains at signup (hard enforcement)
-- ============================================================================
-- This runs BEFORE INSERT on auth.users, so it covers EVERY signup path:
-- email/password, Google OAuth, magic link, OTP — anything that creates a user.
-- A client-side check can be bypassed; this cannot.
-- ============================================================================

-- 1. Table holding the blocklist. Seeded with the most common disposable
--    providers; you can add more rows any time without a code deploy.
create table if not exists public.disposable_email_domains (
  domain text primary key
);

-- Anyone can read (harmless); only service role can write.
alter table public.disposable_email_domains enable row level security;

drop policy if exists "disposable domains readable" on public.disposable_email_domains;
create policy "disposable domains readable"
  on public.disposable_email_domains
  for select
  using (true);

-- 2. Seed the list with widely-used temp-mail domains.
insert into public.disposable_email_domains (domain) values
  ('0-mail.com'),('0clickemail.com'),('10minutemail.com'),('10minutemail.net'),
  ('20minutemail.com'),('33mail.com'),('anonbox.net'),('anonymbox.com'),
  ('binkmail.com'),('bobmail.info'),('bugmenot.com'),('bumpymail.com'),
  ('deadaddress.com'),('despam.it'),('discard.email'),('discardmail.com'),
  ('disposable.com'),('disposableemailaddresses.com'),('dispostable.com'),
  ('dodgeit.com'),('dodgit.com'),('dropmail.me'),('e4ward.com'),
  ('emailondeck.com'),('emailsensei.com'),('emailtemporanea.com'),
  ('emailtemporario.com.br'),('emailwarden.com'),('ephemail.net'),
  ('fakeinbox.com'),('fakemail.net'),('fakemailgenerator.com'),
  ('filzmail.com'),('freundin.ru'),('front14.org'),('getairmail.com'),
  ('getnada.com'),('gishpuppy.com'),('grr.la'),('guerrillamail.biz'),
  ('guerrillamail.com'),('guerrillamail.de'),('guerrillamail.info'),
  ('guerrillamail.net'),('guerrillamail.org'),('guerrillamailblock.com'),
  ('harakirimail.com'),('hidemail.de'),('hmamail.com'),('inboxalias.com'),
  ('inboxbear.com'),('incognitomail.com'),('incognitomail.net'),
  ('incognitomail.org'),('jetable.org'),('kasmail.com'),('koszmail.pl'),
  ('mailcatch.com'),('maildrop.cc'),('maileater.com'),('mailexpire.com'),
  ('mailforspam.com'),('mailimate.com'),('mailinator.com'),('mailinator.net'),
  ('mailinator2.com'),('mailmoat.com'),('mailnesia.com'),('mailnull.com'),
  ('mailsac.com'),('mailtemp.info'),('mailtothis.com'),('mintemail.com'),
  ('moakt.com'),('mohmal.com'),('mt2015.com'),('mytemp.email'),
  ('mytrashmail.com'),('nada.email'),('no-spam.ws'),('nomail.xl.cx'),
  ('nowmymail.com'),('objectmail.com'),('obobbo.com'),('oneoffemail.com'),
  ('onewaymail.com'),('owlpic.com'),('pookmail.com'),('proxymail.eu'),
  ('rcpt.at'),('recode.me'),('regbypass.com'),('rmqkr.net'),('safe-mail.net'),
  ('sharklasers.com'),('shieldemail.com'),('sneakemail.com'),('snkmail.com'),
  ('sofort-mail.de'),('spam4.me'),('spamavert.com'),('spambox.us'),
  ('spamfree24.com'),('spamgourmet.com'),('spamhole.com'),('spaml.com'),
  ('tafmail.com'),('temp-mail.com'),('temp-mail.io'),('temp-mail.org'),
  ('tempail.com'),('tempemail.com'),('tempemail.net'),('tempinbox.com'),
  ('tempmail.com'),('tempmail.de'),('tempmail.net'),('tempmail.plus'),
  ('tempmailaddress.com'),('tempmailer.com'),('tempomail.fr'),
  ('temporarily.de'),('temporaryemail.net'),('temporaryinbox.com'),
  ('throwawayemailaddress.com'),('tmail.ws'),('tmailinator.com'),
  ('trash-mail.com'),('trash2009.com'),('trashmail.com'),('trashmail.de'),
  ('trashmail.me'),('trashmail.net'),('trashmail.org'),('trashmailer.com'),
  ('trashymail.com'),('tyldd.com'),('wegwerfmail.de'),('wegwerfmail.net'),
  ('wegwerfmail.org'),('wh4f.org'),('whyspam.me'),('willselfdestruct.com'),
  ('yopmail.com'),('yopmail.fr'),('yopmail.net'),('yuurok.com'),
  ('zetmail.com'),('mailto.plus'),('fexpost.com'),('fexbox.org'),
  ('rover.info'),('chitthi.in'),('vjuum.com'),('laafd.com'),
  ('vddaz.com'),('sdvft.com')
on conflict (domain) do nothing;

-- 3. Trigger function: reject inserts whose email domain is on the blocklist.
create or replace function public.reject_disposable_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_domain text;
begin
  -- Extract the domain (everything after the last @), lowercased.
  email_domain := lower(split_part(new.email, '@', 2));

  if email_domain is null or email_domain = '' then
    return new; -- no email (e.g. phone signup) — nothing to check
  end if;

  if exists (
    select 1 from public.disposable_email_domains d
    where d.domain = email_domain
  ) then
    raise exception 'DISPOSABLE_EMAIL: Temporary or disposable email addresses are not allowed. Please use a permanent email.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- 4. Attach the trigger to auth.users.
drop trigger if exists trg_reject_disposable_email on auth.users;
create trigger trg_reject_disposable_email
  before insert on auth.users
  for each row
  execute function public.reject_disposable_email();
