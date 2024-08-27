---
layout: post
title: "Port Scanner"
description: "This is a port scanner and banner grabber written in python"
image: "/img/post-bg-about.jpg"
date: 2024-08-27
---

The goal of this project is to create a Python tool that can scan one or multiple IP addresses for open ports within a specified range and retrieve banners from those ports. The tool is designed to be user-friendly, efficient, and capable of handling multiple IP addresses and port ranges.

## Features

- Scan single or multiple IP addresses
- Scan a custom range of ports
- Concurrent port scanning for improved speed
- Banner grabbing from open ports
- Output results to a user-specified file
- User-friendly command-line interface
- IP address validation

## Technologies Used

- Python 3.x
- socket module for network connections
- concurrent.futures for multithreading
- ipaddress module for IP address validation
- File I/O for saving results

## Source Code

Feel free to expand on this content with specific details about your example project.

{% highlight python %}
import socket
import concurrent.futures
import ipaddress

def scan_port(ip, port, timeout=1):
    try:
        with socket.create_connection((ip, port), timeout=timeout) as sock:
            sock.settimeout(timeout)
            banner = sock.recv(1024).decode('utf-8', 'ignore').strip()
            return f"{ip} - {port} - {banner}"
    except (socket.timeout, ConnectionRefusedError):
        return None

def scan_ip(ip, start_port, end_port, output_file):
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = [executor.submit(scan_port, ip, port) for port in range(start_port, end_port + 1)]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result:
                print(result)
                with open(output_file, 'a') as f:
                    f.write(result + '\n')

def main():
    output_file = input("Enter the output file name: ")
    ip_input = input("Enter IP address(es) (comma-separated for multiple): ")
    start_port = int(input("Enter start port: "))
    end_port = int(input("Enter end port: "))

    ip_list = [ip.strip() for ip in ip_input.split(',')]

    for ip in ip_list:
        try:
            ipaddress.ip_address(ip)
        except ValueError:
            print(f"Invalid IP address: {ip}")
            continue

        print(f"Scanning {ip}...")
        scan_ip(ip, start_port, end_port, output_file)

    print(f"Scan complete. Results saved to {output_file}")

if __name__ == "__main__":
    main()

{% endhighlight %}