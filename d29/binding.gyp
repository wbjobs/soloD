{
  "targets": [
    {
      "target_name": "noise_calculator",
      "sources": [
        "cpp/src/noise_calculator.cpp",
        "cpp/src/circuit_elements.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "cpp/include"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "conditions": [
        ["OS=='win'", {
          "defines": [
            "WIN32_LEAN_AND_MEAN",
            "NOMINMAX",
            "NAPI_DISABLE_CPP_EXCEPTIONS",
            "_CRT_SECURE_NO_WARNINGS"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 0,
              "RuntimeTypeInfo": "true",
              "Optimization": 2
            }
          },
          "configurations": {
            "Release": {
              "msvs_settings": {
                "VCLinkerTool": {
                  "AdditionalOptions": [
                    "/OPT:REF",
                    "/OPT:ICF"
                  ]
                }
              }
            }
          }
        }]
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
    }
  ]
}
