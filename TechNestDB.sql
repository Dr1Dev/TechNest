CREATE DATABASE TechNestDB;


USE TechNestDB;

CREATE TABLE Users (
  UserID INT IDENTITY(1,1) PRIMARY KEY,
  Username NVARCHAR(50) NOT NULL UNIQUE,
  PasswordHash NVARCHAR(200) NOT NULL,
  FullName NVARCHAR(100) NULL
);
CREATE TABLE Products (
  ProductID INT IDENTITY(1,1) PRIMARY KEY,
  Name NVARCHAR(150) NOT NULL,
  Category NVARCHAR(50) NOT NULL,
  Price DECIMAL(10,2) NOT NULL CHECK (Price >= 0),
  Stock INT NOT NULL DEFAULT 0 CHECK (Stock >= 0),
  Active BIT NOT NULL DEFAULT 1,
  ImageURL NVARCHAR(300) NULL
);
CREATE TABLE Sales (
  SaleID INT IDENTITY(1,1) PRIMARY KEY,
  SaleDate DATETIME NOT NULL DEFAULT GETDATE(),
  Total DECIMAL(10,2) NOT NULL,
  PaymentMethod NVARCHAR(20) NOT NULL DEFAULT 'Cash',
  DiscountPercent DECIMAL(5,2) NOT NULL DEFAULT 0,
  UserID INT NULL FOREIGN KEY REFERENCES Users(UserID)
);
CREATE TABLE SaleItems (
  SaleItemID INT IDENTITY(1,1) PRIMARY KEY,
  SaleID INT NOT NULL FOREIGN KEY REFERENCES Sales(SaleID),
  ProductID INT NOT NULL FOREIGN KEY REFERENCES Products(ProductID),
  Quantity INT NOT NULL CHECK (Quantity > 0),
  UnitPrice DECIMAL(10,2) NOT NULL
);

INSERT INTO Products (Name, Category, Price, Stock) VALUES
('Intel Core i5-13600K', 'CPU', 319.99, 15),
('AMD Ryzen 7 7800X3D', 'CPU', 449.00, 10),
('NVIDIA RTX 4060 8GB', 'GPU', 299.99, 8),
('AMD Radeon RX 7800 XT', 'GPU', 499.00, 6),
('Corsair Vengeance 16GB DDR5', 'RAM', 74.50, 40),
('Kingston Fury 32GB DDR4', 'RAM', 89.99, 25),
('Samsung 980 Pro 1TB NVMe', 'Storage', 99.00, 30),
('Lenovo IdeaPad 5 Laptop', 'Laptop', 649.00, 7),
('HP Pavilion 15 Laptop', 'Laptop', 579.50, 9),
('Logitech MX Master 3S Mouse', 'Peripherals', 99.99, 20),
('Keychron K2 Keyboard', 'Peripherals', 89.00, 18),
('Dell 27" 144Hz Monitor', 'Peripherals', 219.00, 12);

