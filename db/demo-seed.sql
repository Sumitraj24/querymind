-- QueryMind AI demo dataset (fictional sample data).
-- Loaded automatically into the in-process demo database when DATABASE_URL is not set.
-- You can also load it into your own PostgreSQL to try live mode:
--   psql "$ADMIN_DATABASE_URL" -f db/demo-seed.sql

CREATE TABLE departments (
  id        integer PRIMARY KEY,
  name      varchar(80) NOT NULL UNIQUE,
  location  varchar(80) NOT NULL
);
COMMENT ON TABLE departments IS 'Company departments';

CREATE TABLE employees (
  id             integer PRIMARY KEY,
  first_name     varchar(80) NOT NULL,
  last_name      varchar(80) NOT NULL,
  email          varchar(255) NOT NULL,
  job_title      varchar(120) NOT NULL,
  department_id  integer NOT NULL REFERENCES departments(id),
  salary         numeric(12,2) NOT NULL,
  hire_date      date NOT NULL
);
COMMENT ON TABLE employees IS 'Company employees. salary is the monthly salary in INR.';

CREATE TABLE branches (
  id    integer PRIMARY KEY,
  name  varchar(120) NOT NULL,
  city  varchar(80) NOT NULL
);
COMMENT ON TABLE branches IS 'Bank branches';

CREATE TABLE customers (
  id          integer PRIMARY KEY,
  first_name  varchar(80) NOT NULL,
  last_name   varchar(80) NOT NULL,
  email       varchar(255) NOT NULL,
  city        varchar(80),
  balance     numeric(14,2) NOT NULL,
  branch_id   integer REFERENCES branches(id),
  created_at  timestamp NOT NULL
);
COMMENT ON TABLE customers IS 'Bank customers. balance is the total balance across accounts in INR.';

CREATE TABLE accounts (
  id            integer PRIMARY KEY,
  customer_id   integer NOT NULL REFERENCES customers(id),
  account_type  varchar(20) NOT NULL,
  balance       numeric(14,2) NOT NULL,
  status        varchar(20) NOT NULL,
  opened_at     date NOT NULL
);
COMMENT ON TABLE accounts IS 'Customer bank accounts. account_type is checking, savings or credit; status is active, frozen or closed.';

CREATE TABLE transactions (
  id                bigint PRIMARY KEY,
  account_id        integer NOT NULL REFERENCES accounts(id),
  amount            numeric(14,2) NOT NULL,
  transaction_type  varchar(20) NOT NULL,
  description       text,
  created_at        timestamp NOT NULL
);
COMMENT ON TABLE transactions IS 'Account transactions. transaction_type is deposit, withdrawal, transfer or fee.';

CREATE TABLE loans (
  id             integer PRIMARY KEY,
  customer_id    integer NOT NULL REFERENCES customers(id),
  principal      numeric(14,2) NOT NULL,
  interest_rate  numeric(5,2) NOT NULL,
  status         varchar(20) NOT NULL,
  issued_at      date NOT NULL
);
COMMENT ON TABLE loans IS 'Loans issued to customers. status is active, paid or defaulted.';

INSERT INTO departments (id, name, location) VALUES
  (1, 'Engineering', 'Bengaluru'),
  (2, 'Sales', 'Mumbai'),
  (3, 'Finance', 'Delhi'),
  (4, 'Human Resources', 'Pune'),
  (5, 'Marketing', 'Hyderabad'),
  (6, 'Operations', 'Chennai');

INSERT INTO employees (id, first_name, last_name, email, job_title, department_id, salary, hire_date) VALUES
  (1,  'Rahul',   'Sharma',   'rahul.sharma@example.com',   'Engineering Manager',  1, 90000, '2018-04-12'),
  (2,  'Priya',   'Iyer',     'priya.iyer@example.com',     'Senior Engineer',      1, 85000, '2019-07-01'),
  (3,  'Amit',    'Verma',    'amit.verma@example.com',     'Finance Lead',         3, 80000, '2017-11-20'),
  (4,  'Sneha',   'Patel',    'sneha.patel@example.com',    'Sales Director',       2, 78000, '2016-02-15'),
  (5,  'Vikram',  'Singh',    'vikram.singh@example.com',   'Senior Engineer',      1, 76000, '2020-01-06'),
  (6,  'Ananya',  'Reddy',    'ananya.reddy@example.com',   'Marketing Manager',    5, 72000, '2019-03-18'),
  (7,  'Karan',   'Mehta',    'karan.mehta@example.com',    'Operations Manager',   6, 70000, '2018-09-10'),
  (8,  'Divya',   'Nair',     'divya.nair@example.com',     'Engineer',             1, 65000, '2021-05-24'),
  (9,  'Arjun',   'Gupta',    'arjun.gupta@example.com',    'Account Executive',    2, 62000, '2020-08-03'),
  (10, 'Meera',   'Joshi',    'meera.joshi@example.com',    'HR Manager',           4, 61000, '2017-06-12'),
  (11, 'Rohan',   'Kapoor',   'rohan.kapoor@example.com',   'Financial Analyst',    3, 58000, '2021-10-11'),
  (12, 'Kavya',   'Menon',    'kavya.menon@example.com',    'Engineer',             1, 57000, '2022-02-07'),
  (13, 'Siddharth','Rao',     'siddharth.rao@example.com',  'Account Executive',    2, 55000, '2021-01-19'),
  (14, 'Pooja',   'Desai',    'pooja.desai@example.com',    'Content Strategist',   5, 52000, '2022-06-27'),
  (15, 'Nikhil',  'Bansal',   'nikhil.bansal@example.com',  'Logistics Coordinator',6, 48000, '2022-09-05'),
  (16, 'Isha',    'Chopra',   'isha.chopra@example.com',    'Recruiter',            4, 46000, '2023-01-16'),
  (17, 'Aditya',  'Kulkarni', 'aditya.kulkarni@example.com','Junior Engineer',      1, 45000, '2023-07-03'),
  (18, 'Neha',    'Agarwal',  'neha.agarwal@example.com',   'Sales Associate',      2, 42000, '2023-04-10'),
  (19, 'Manish',  'Pandey',   'manish.pandey@example.com',  'Accountant',           3, 41000, '2022-12-01'),
  (20, 'Ritu',    'Saxena',   'ritu.saxena@example.com',    'Operations Analyst',   6, 40000, '2024-02-12'),
  (21, 'Harsh',   'Malhotra', 'harsh.malhotra@example.com', 'Marketing Associate',  5, 38000, '2024-05-20'),
  (22, 'Tanvi',   'Bhatt',    'tanvi.bhatt@example.com',    'HR Associate',         4, 36000, '2024-08-01');

INSERT INTO branches (id, name, city) VALUES
  (1, 'MG Road Branch', 'Bengaluru'),
  (2, 'Andheri Branch', 'Mumbai'),
  (3, 'Connaught Place Branch', 'Delhi'),
  (4, 'Koregaon Park Branch', 'Pune'),
  (5, 'T Nagar Branch', 'Chennai');

-- 40 customers. Values are derived from the id so the data is deterministic.
INSERT INTO customers (id, first_name, last_name, email, city, balance, branch_id, created_at)
SELECT
  i,
  (ARRAY['Aarav','Diya','Ishaan','Saanvi','Vihaan','Anika','Kabir','Myra','Reyansh','Aditi'])[1 + (i % 10)],
  (ARRAY['Khan','Das','Pillai','Bose','Mishra','Thomas','Ghosh','Shetty'])[1 + (i % 8)],
  CASE WHEN i IN (7, 23) THEN 'shared.inbox@example.com'
       WHEN i IN (12, 31) THEN 'family.account@example.com'
       ELSE 'customer' || i || '@example.com' END,
  (ARRAY['Bengaluru','Mumbai','Delhi','Pune','Chennai'])[1 + (i % 5)],
  round(((i * 7919) % 12000 + 250)::numeric, 2),
  1 + (i % 5),
  timestamp '2023-01-01' + (i * 9) * interval '1 day'
FROM generate_series(1, 40) AS s(i);

-- 1 to 2 accounts per customer.
INSERT INTO accounts (id, customer_id, account_type, balance, status, opened_at)
SELECT
  row_number() OVER (ORDER BY c, n),
  c,
  (ARRAY['checking','savings','credit'])[1 + ((c + n) % 3)],
  round((((c * 104729 + n * 31) % 9000) + 100)::numeric, 2),
  CASE WHEN (c + n) % 13 = 0 THEN 'frozen' WHEN (c + n) % 17 = 0 THEN 'closed' ELSE 'active' END,
  date '2023-01-15' + (c * 7 + n * 30)
FROM generate_series(1, 40) AS a(c)
CROSS JOIN generate_series(1, 2) AS b(n)
WHERE n = 1 OR c % 3 = 0;

-- About 600 transactions spread over 2025.
INSERT INTO transactions (id, account_id, amount, transaction_type, description, created_at)
SELECT
  t,
  1 + (t * 37) % (SELECT count(*) FROM accounts),
  CASE (t % 4)
    WHEN 0 THEN round(((t * 131) % 4000 + 500)::numeric, 2)
    WHEN 1 THEN -round(((t * 97) % 2500 + 100)::numeric, 2)
    WHEN 2 THEN -round(((t * 53) % 3000 + 200)::numeric, 2)
    ELSE -round(((t * 7) % 40 + 5)::numeric, 2) END,
  (ARRAY['deposit','withdrawal','transfer','fee'])[1 + (t % 4)],
  (ARRAY['Salary credit','ATM withdrawal','Online transfer','Service fee'])[1 + (t % 4)],
  timestamp '2025-01-01' + ((t * 13) % 365) * interval '1 day' + ((t * 7) % 24) * interval '1 hour'
FROM generate_series(1, 600) AS s(t);

-- Loans for roughly a third of customers.
INSERT INTO loans (id, customer_id, principal, interest_rate, status, issued_at)
SELECT
  row_number() OVER (ORDER BY c),
  c,
  round(((c * 15485863) % 400000 + 50000)::numeric, 2),
  round((7 + (c % 6) * 0.75)::numeric, 2),
  (ARRAY['active','paid','defaulted','active'])[1 + (c % 4)],
  date '2023-03-01' + c * 11
FROM generate_series(1, 40) AS s(c)
WHERE c % 3 = 1;
