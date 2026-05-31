package com.finance;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FinanceDataPlatformApplication {
    public static void main(String[] args) {
        SpringApplication.run(FinanceDataPlatformApplication.class, args);
    }
}
