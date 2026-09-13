update public.profiles p
set cash_on_hand = 640.00,
    spending_buffer = 100.00,
    balance_as_of = current_date,
    pay_frequency = 'biweekly',
    next_pay_date = current_date + interval '9 days',
    budget_method = 'fifty_thirty_twenty',
    updated_at = now()
from auth.users u
where u.id = p.id and u.email = 'demo@budgetchek.app';