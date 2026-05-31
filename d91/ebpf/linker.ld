SECTIONS {
    . = 0;
    .text : { *(.text) }
    .rodata : { *(.rodata) }
    .maps : { *(.maps) }
    .bss : { *(.bss) }
    .data : { *(.data) }
}
